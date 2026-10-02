import { connect } from 'cloudflare:sockets';

const MAX_STATUS_PACKET_BYTES = 1_048_576;
const STATUS_PROTOCOL_VERSION = 767;

export interface MinecraftServerCheck {
  status: 'ONLINE' | 'OFFLINE';
  checkedAt: string;
  responseTimeMs: number;
  version?: string;
  onlinePlayers?: number;
  maxPlayers?: number;
  motd?: string;
  error?: string;
}

class MinecraftProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MinecraftProtocolError';
  }
}

function encodeVarInt(value: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = value >>> 0;
  do {
    let next = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) next |= 0x80;
    bytes.push(next);
  } while (remaining !== 0);
  return Uint8Array.from(bytes);
}

function decodeVarInt(bytes: Uint8Array, start = 0): { value: number; nextOffset: number } {
  let value = 0;
  let position = start;
  for (let index = 0; index < 5; index += 1) {
    if (position >= bytes.length) throw new MinecraftProtocolError('Minecraft status packet ended inside a VarInt');
    const byte = bytes[position++];
    value |= (byte & 0x7f) << (index * 7);
    if ((byte & 0x80) === 0) return { value, nextOffset: position };
  }
  throw new MinecraftProtocolError('Minecraft status packet contains an oversized VarInt');
}

function concatenate(chunks: readonly Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function encodeString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  return concatenate([encodeVarInt(bytes.byteLength), bytes]);
}

function createStatusRequest(host: string, port: number): Uint8Array {
  const hostBytes = encodeString(host);
  const portBytes = Uint8Array.of((port >>> 8) & 0xff, port & 0xff);
  const handshake = concatenate([
    encodeVarInt(0),
    encodeVarInt(STATUS_PROTOCOL_VERSION),
    hostBytes,
    portBytes,
    encodeVarInt(1)
  ]);
  const handshakePacket = concatenate([encodeVarInt(handshake.byteLength), handshake]);
  return concatenate([handshakePacket, Uint8Array.of(1, 0)]);
}

class MinecraftSocketReader {
  private buffer: Uint8Array = new Uint8Array();

  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

  async readExactly(length: number): Promise<Uint8Array> {
    while (this.buffer.byteLength < length) {
      const { value, done } = await this.reader.read();
      if (done || !value) throw new MinecraftProtocolError('Minecraft server closed the status connection early');
      if (this.buffer.byteLength + value.byteLength > MAX_STATUS_PACKET_BYTES) {
        throw new MinecraftProtocolError('Minecraft status response exceeded the size limit');
      }
      this.buffer = concatenate([this.buffer, value]);
    }
    const bytes = this.buffer.slice(0, length);
    this.buffer = this.buffer.slice(length);
    return bytes;
  }

  async readVarInt(): Promise<number> {
    const bytes: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const byte = (await this.readExactly(1))[0];
      bytes.push(byte);
      if ((byte & 0x80) === 0) return decodeVarInt(Uint8Array.from(bytes)).value;
    }
    throw new MinecraftProtocolError('Minecraft response contains an oversized packet length');
  }
}

function extractStatusDetails(packet: Uint8Array): Pick<MinecraftServerCheck, 'version' | 'onlinePlayers' | 'maxPlayers' | 'motd'> {
  const packetId = decodeVarInt(packet);
  if (packetId.value !== 0) throw new MinecraftProtocolError('Minecraft server returned an unexpected status packet');

  const stringLength = decodeVarInt(packet, packetId.nextOffset);
  if (stringLength.value < 0 || stringLength.value > MAX_STATUS_PACKET_BYTES) {
    throw new MinecraftProtocolError('Minecraft server returned an invalid status JSON length');
  }
  const stringEnd = stringLength.nextOffset + stringLength.value;
  if (stringEnd > packet.byteLength) throw new MinecraftProtocolError('Minecraft status JSON was truncated');

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(packet.slice(stringLength.nextOffset, stringEnd)));
  } catch {
    throw new MinecraftProtocolError('Minecraft server returned invalid status JSON');
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new MinecraftProtocolError('Minecraft status JSON must be an object');
  }

  const status = payload as Record<string, unknown>;
  const version = typeof status.version === 'object' && status.version !== null
    ? status.version as Record<string, unknown>
    : undefined;
  const players = typeof status.players === 'object' && status.players !== null
    ? status.players as Record<string, unknown>
    : undefined;
  const description = typeof status.description === 'string' ? status.description : undefined;

  return {
    ...(typeof version?.name === 'string' ? { version: version.name } : {}),
    ...(typeof players?.online === 'number' ? { onlinePlayers: players.online } : {}),
    ...(typeof players?.max === 'number' ? { maxPlayers: players.max } : {}),
    ...(description ? { motd: description } : {})
  };
}

async function pingMinecraftServer(
  host: string,
  port: number,
  timeoutMs: number
): Promise<Pick<MinecraftServerCheck, 'version' | 'onlinePlayers' | 'maxPlayers' | 'motd'>> {
  const socket = connect({ hostname: host, port }, { secureTransport: 'off', allowHalfOpen: false });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void socket.close().catch((error: unknown) => {
      console.warn('[mc-checker] Failed to close timed-out TCP socket:', error);
    });
  }, timeoutMs);

  try {
    await socket.opened;
    const writer = socket.writable.getWriter();
    try {
      await writer.write(createStatusRequest(host, port));
    } finally {
      writer.releaseLock();
    }

    const reader = socket.readable.getReader();
    try {
      const bufferedReader = new MinecraftSocketReader(reader);
      const packetLength = await bufferedReader.readVarInt();
      if (packetLength < 1 || packetLength > MAX_STATUS_PACKET_BYTES) {
        throw new MinecraftProtocolError('Minecraft server returned an invalid status packet length');
      }
      const packet = await bufferedReader.readExactly(packetLength);
      return extractStatusDetails(packet);
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (timedOut) throw new Error(`Minecraft status ping timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
    try {
      await socket.close();
    } catch (error) {
      console.warn('[mc-checker] Failed to close TCP socket:', error);
    }
  }
}

export async function checkMinecraftServer(
  host: string,
  port: number,
  timeoutMs = 2_000
): Promise<MinecraftServerCheck> {
  const normalizedHost = host.trim();
  if (!normalizedHost || /[\u0000-\u0020]/.test(normalizedHost) ||
      new TextEncoder().encode(normalizedHost).byteLength > 255) {
    throw new TypeError('MC_SERVER_HOST must be a valid Minecraft server hostname');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new RangeError('MC_SERVER_PORT must be an integer from 1 to 65535');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('Minecraft status timeout must be a positive integer');
  }

  const startedAt = Date.now();
  const checkedAt = new Date(startedAt).toISOString();
  try {
    const details = await pingMinecraftServer(normalizedHost, port, timeoutMs);
    return {
      status: 'ONLINE',
      checkedAt,
      responseTimeMs: Date.now() - startedAt,
      ...details
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      status: 'OFFLINE',
      checkedAt,
      responseTimeMs: Date.now() - startedAt,
      error: reason
    };
  }
}
