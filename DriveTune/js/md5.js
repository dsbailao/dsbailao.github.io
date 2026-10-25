// MD5 (RFC 1321). A API do Subsonic/Navidrome pede o token md5(senha + salt)
// e o Web Crypto do navegador não oferece MD5.
const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5(text) {
  const bytes = new TextEncoder().encode(text);
  const blocks = ((bytes.length + 8) >> 6) + 1;
  const w = new Uint32Array(blocks * 16);
  bytes.forEach((b, i) => { w[i >> 2] |= b << ((i % 4) * 8); });
  w[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
  w[blocks * 16 - 2] = bytes.length * 8;

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  for (let off = 0; off < w.length; off += 16) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      const r = i >> 4;
      let f;
      let g;
      if (r === 0) { f = (b & c) | (~b & d); g = i; }
      else if (r === 1) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (r === 2) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const x = (a + f + K[i] + w[off + g]) | 0;
      const s = S[r * 4 + (i % 4)];
      a = d;
      d = c;
      c = b;
      b = (b + ((x << s) | (x >>> (32 - s)))) | 0;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }
  return [a0, b0, c0, d0]
    .map((v) => [0, 8, 16, 24].map((k) => ((v >>> k) & 0xff).toString(16).padStart(2, '0')).join(''))
    .join('');
}
