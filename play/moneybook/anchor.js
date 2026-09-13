/*
 * 허니 가계부 · 블록체인 기록 페이지 — **앱이 아니라 이 페이지가 인터넷에 닿는다.**
 *
 * 왜 여기인가: 안드로이드 출시 앱에는 인터넷 권한이 0줄이다(방침 8항 · 게이트 G18).
 * 그 사실을 지키면서 공개 블록체인에 닿으려면, 이미 인터넷이 있는 브라우저가 보내야 한다.
 * 앱은 지문을 보여주고 복사만 한다(`lib/data/anchor/ots_proof.dart`).
 *
 * 🔴 이 페이지가 밖으로 보내는 것 (방침 2-5항 · 게이트 G18-G 가 문다)
 *   · 도장 찍기   POST <캘린더>/digest   본문 = sha256(지문 ‖ 무작위 16바이트) **32바이트 하나**
 *   · 확정 받기   GET  <캘린더>/timestamp/<위 값에서 계산된 값>   본문 없음
 *   · 확인하기   GET  <탐색기>/api/block-height/<번호> · /api/block/<해시>   본문 없음
 *   주소는 아래 세 목록뿐이고, anchor.html 의 CSP(connect-src)가 브라우저 차원에서 같은 목록을 강제한다.
 *   증명서에 적힌 캘린더 주소가 목록 밖이면 **연결하지 않는다**(남이 만든 증명서로 IP를 빼가는 길 차단).
 *
 * 형식: OpenTimestamps `.ots` (python-opentimestamps 0.4.5 와 같은 바이트 규칙).
 * 쿠키·IndexedDB·앱 저장소는 건드리지 않는다. localStorage 에는 증명서(비밀 아님)만 둔다.
 */
(function (root) {
  'use strict';

  const STAMP_CALENDARS = [
    'https://a.pool.opentimestamps.org',
    'https://b.pool.opentimestamps.org',
    'https://a.pool.eternitywall.com',
  ];
  const UPGRADE_CALENDARS = [
    'https://alice.btc.calendar.opentimestamps.org',
    'https://bob.btc.calendar.opentimestamps.org',
    'https://finney.calendar.eternitywall.com',
  ];
  // catallaxy 캘린더는 뺐다 — 브라우저 연결(CORS)을 받지 않아 이 페이지에서는 **절대 성공할 수 없고**
  // IP 만 남긴다(2026-09-13 실제 브라우저에서 차단 확인).
  const EXPLORERS = ['https://blockstream.info', 'https://mempool.space'];
  const ACCEPT = 'application/vnd.opentimestamps.v1';
  const MAGIC = unhex('004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294');
  const PENDING = '83dfe30d2ef90c8e';
  const BITCOIN = '0588960d73d71901';
  // 쿠키를 싣지 않고, 이 페이지 주소를 Referer 로 알리지 않는다.
  const QUIET = { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' };

  function hex(u8) {
    return Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  function unhex(s) {
    if (!/^([0-9a-f]{2})*$/i.test(s)) throw new Error('16진수가 아니에요');
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
    return out;
  }
  function concat(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }
  async function sha256(u8) {
    return new Uint8Array(await root.crypto.subtle.digest('SHA-256', u8));
  }
  function toB64(u8) {
    let s = '';
    u8.forEach((b) => (s += String.fromCharCode(b)));
    return root.btoa(s);
  }
  function fromB64(text) {
    const s = root.atob(String(text).replace(/\s/g, ''));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  }

  // ── 바이트 읽기·쓰기 ─────────────────────────────────────────────
  function Reader(bytes) {
    this.b = bytes;
    this.p = 0;
  }
  Reader.prototype.u8 = function () {
    if (this.p >= this.b.length) throw new Error('증명서가 중간에 끊겼어요');
    return this.b[this.p++];
  };
  Reader.prototype.take = function (n) {
    if (this.p + n > this.b.length) throw new Error('증명서가 중간에 끊겼어요');
    const out = this.b.slice(this.p, this.p + n);
    this.p += n;
    return out;
  };
  Reader.prototype.varuint = function () {
    let value = 0;
    let scale = 1;
    for (let i = 0; i < 8; i++) {
      const b = this.u8();
      value += (b & 0x7f) * scale;
      if (b < 0x80) return value;
      scale *= 128;
    }
    throw new Error('증명서의 숫자가 너무 커요');
  };
  Reader.prototype.varbytes = function () {
    const n = this.varuint();
    if (n > 8192) throw new Error('증명서 값이 너무 길어요');
    return this.take(n);
  };

  function Writer() {
    this.parts = [];
  }
  Writer.prototype.u8 = function (v) {
    this.parts.push(Uint8Array.of(v));
  };
  Writer.prototype.bytes = function (u8) {
    this.parts.push(u8);
  };
  Writer.prototype.varuint = function (v) {
    const out = [];
    do {
      let b = v % 128;
      v = Math.floor(v / 128);
      if (v > 0) b |= 0x80;
      out.push(b);
    } while (v > 0);
    this.parts.push(Uint8Array.from(out));
  };
  Writer.prototype.varbytes = function (u8) {
    this.varuint(u8.length);
    this.bytes(u8);
  };
  Writer.prototype.done = function () {
    return this.parts.reduce(concat, new Uint8Array(0));
  };

  // ── 증명서 나무 ─────────────────────────────────────────────────
  // 마디 = { msg, atts: [{ tag(hex 8바이트), payload }], ops: [{ tag, arg, node }] }
  async function applyOp(tag, arg, msg) {
    if (tag === 0xf0) return concat(msg, arg);
    if (tag === 0xf1) return concat(arg, msg);
    if (tag === 0x08) return sha256(msg);
    throw new Error('이 페이지가 모르는 계산 단계(0x' + tag.toString(16) + ')');
  }

  async function readNode(r, msg, depth) {
    if (depth > 256) throw new Error('증명서 경로가 너무 깊어요');
    const node = { msg, atts: [], ops: [] };
    const branch = async (tag) => {
      if (tag === 0x00) {
        node.atts.push({ tag: hex(r.take(8)), payload: r.varbytes() });
        return;
      }
      const arg = tag === 0xf0 || tag === 0xf1 ? r.varbytes() : null;
      const next = await applyOp(tag, arg, msg);
      node.ops.push({ tag, arg, node: await readNode(r, next, depth + 1) });
    };
    let tag = r.u8();
    while (tag === 0xff) {
      await branch(r.u8());
      tag = r.u8();
    }
    await branch(tag);
    return node;
  }

  function writeNode(w, node) {
    const branches = node.atts.map((a) => ['a', a]).concat(node.ops.map((o) => ['o', o]));
    if (!branches.length) throw new Error('빈 증명서 마디는 쓸 수 없어요');
    branches.forEach(([kind, v], i) => {
      if (i < branches.length - 1) w.u8(0xff);
      if (kind === 'a') {
        w.u8(0x00);
        w.bytes(unhex(v.tag));
        w.varbytes(v.payload);
      } else {
        w.u8(v.tag);
        if (v.arg) w.varbytes(v.arg);
        writeNode(w, v.node);
      }
    });
  }

  async function parseProof(bytes) {
    const r = new Reader(bytes);
    if (bytes.length > 65536 || hex(r.take(MAGIC.length)) !== hex(MAGIC)) {
      throw new Error('블록체인 증명서 형식이 아니에요');
    }
    if (r.varuint() !== 1 || r.u8() !== 0x08) throw new Error('모르는 증명서 판이에요');
    const digest = r.take(32);
    const node = await readNode(r, digest, 0);
    if (r.p !== bytes.length) throw new Error('증명서 끝에 모르는 바이트가 있어요');
    return { digest, node };
  }

  function serializeProof(proof) {
    const w = new Writer();
    w.bytes(MAGIC);
    w.varuint(1);
    w.u8(0x08);
    w.bytes(proof.digest);
    writeNode(w, proof.node);
    return w.done();
  }

  async function readSubtree(res, msg) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    const r = new Reader(bytes);
    const sub = await readNode(r, msg, 0);
    if (r.p !== bytes.length) throw new Error('캘린더 응답 끝에 모르는 바이트가 있어요');
    return sub;
  }

  // ── ① 도장 찍기 ─────────────────────────────────────────────────
  async function stamp(digestHex, fetchImpl) {
    if (!/^[0-9a-f]{64}$/.test(digestHex)) throw new Error('지문은 0~9·a~f 64글자여야 해요');
    const digest = unhex(digestHex);
    const nonce = root.crypto.getRandomValues(new Uint8Array(16));
    const salted = { msg: concat(digest, nonce), atts: [], ops: [] };
    const top = { msg: await sha256(salted.msg), atts: [], ops: [] };
    salted.ops.push({ tag: 0x08, arg: null, node: top });
    const settled = await Promise.allSettled(
      STAMP_CALENDARS.map(async (url) => {
        const res = await fetchImpl(url + '/digest', {
          method: 'POST',
          headers: { Accept: ACCEPT, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: top.msg,
          ...QUIET,
        });
        if (!res.ok) throw new Error(url + ' 응답 ' + res.status);
        return readSubtree(res, top.msg);
      }),
    );
    const failed = [];
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        top.atts.push(...s.value.atts);
        top.ops.push(...s.value.ops);
      } else failed.push(STAMP_CALENDARS[i] + ' — ' + s.reason.message);
    });
    if (!top.atts.length && !top.ops.length) {
      throw new Error('캘린더 서버가 모두 응답하지 않았어요: ' + failed.join(' / '));
    }
    const node = { msg: digest, atts: [], ops: [{ tag: 0xf0, arg: nonce, node: salted }] };
    return { proof: serializeProof({ digest, node }), accepted: STAMP_CALENDARS.length - failed.length, failed };
  }

  // ── ② 확정 받기 ─────────────────────────────────────────────────
  async function upgrade(proofBytes, fetchImpl) {
    const proof = await parseProof(proofBytes);
    const tally = { upgraded: 0, waiting: 0, failed: [] };
    const walk = async (node) => {
      for (const att of node.atts.slice()) {
        if (att.tag !== PENDING) continue;
        const uri = new TextDecoder().decode(new Reader(att.payload).varbytes());
        if (!UPGRADE_CALENDARS.includes(uri)) {
          tally.failed.push(uri + ' — 목록 밖 주소라 연결하지 않았어요');
          continue;
        }
        let res;
        try {
          res = await fetchImpl(uri + '/timestamp/' + hex(node.msg), {
            headers: { Accept: ACCEPT },
            ...QUIET,
          });
        } catch (e) {
          // 캘린더는 대기 중일 때 CORS 머리 없이 404를 준다 — 브라우저는 그걸 연결 실패로 본다.
          tally.failed.push(uri + ' — 아직 대기 중이거나 연결 실패');
          continue;
        }
        if (!res.ok) {
          tally.waiting++;
          continue;
        }
        const sub = await readSubtree(res, node.msg);
        node.ops.push(...sub.ops);
        node.atts.push(...sub.atts.filter((a) => a.tag !== PENDING));
        tally.upgraded++;
      }
      for (const op of node.ops) await walk(op.node);
    };
    await walk(proof.node);
    return { proof: serializeProof(proof), ...tally };
  }

  function bitcoinStamps(node, out = []) {
    for (const att of node.atts) {
      if (att.tag === BITCOIN) out.push({ height: new Reader(att.payload).varuint(), msg: node.msg });
    }
    for (const op of node.ops) bitcoinStamps(op.node, out);
    return out;
  }

  // ── ③ 비트코인에서 확인 ─────────────────────────────────────────
  async function verify(proofBytes, fetchImpl) {
    const proof = await parseProof(proofBytes);
    const found = bitcoinStamps(proof.node).sort((a, b) => a.height - b.height);
    if (!found.length) return { digest: hex(proof.digest), height: null, checks: [] };
    const { height, msg } = found[0];
    const merkleRoot = hex(msg.slice().reverse());
    const checks = [];
    for (const base of EXPLORERS) {
      try {
        const hashRes = await fetchImpl(base + '/api/block-height/' + height, QUIET);
        const hash = (await hashRes.text()).trim();
        if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('블록 해시가 아니에요');
        const block = await (await fetchImpl(base + '/api/block/' + hash, QUIET)).json();
        checks.push({ base, hash, match: block.merkle_root === merkleRoot, time: block.timestamp });
      } catch (e) {
        checks.push({ base, error: e.message });
      }
    }
    return { digest: hex(proof.digest), height, merkleRoot, checks };
  }

  const api = {
    STAMP_CALENDARS, UPGRADE_CALENDARS, EXPLORERS,
    stamp, upgrade, verify, parseProof, serializeProof, toB64, fromB64, hex, unhex,
  };
  root.HoneyAnchor = api;
  if (typeof module === 'object' && module.exports) module.exports = api;

  // ── 화면 ────────────────────────────────────────────────────────
  if (typeof document === 'undefined') return;
  const $ = (id) => document.getElementById(id);
  const say = (id, text, bad) => {
    $(id).textContent = text;
    $(id).className = bad ? 'msg bad' : 'msg';
  };
  const remember = (digestHex, b64) => {
    try {
      root.localStorage.setItem('honey.anchor.' + digestHex, b64);
    } catch (e) {
      /* 사생활 보호 창 등에서는 못 남긴다 — 화면의 증명 글자가 정본이다 */
    }
  };
  const recall = (digestHex) => {
    try {
      return root.localStorage.getItem('honey.anchor.' + digestHex);
    } catch (e) {
      return null;
    }
  };
  const busy = (on) => document.querySelectorAll('button').forEach((b) => (b.disabled = on));
  const showProof = (b64) => {
    $('proof').value = b64;
    $('copy').hidden = false;
  };

  // 주소 `#` 뒤의 지문을 칸에 채운다. 이미 열린 탭에 새 주소를 붙여 넣으면 페이지가 다시 읽히지 않고
  // `#` 뒤만 바뀐다 — 그래서 처음 열 때와 `hashchange` 둘 다에서 부른다(2026-09-13 브라우저에서 실측한 결함).
  const fillFromHash = () => {
    const fromHash = decodeURIComponent(root.location.hash.slice(1)).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(fromHash)) return;
    $('digest').value = fromHash;
    const kept = recall(fromHash);
    if (kept) {
      showProof(kept);
      say('stampMsg', '이 지문의 증명서가 이 브라우저에 있어요. 아래에서 확정을 받아 보세요.');
    }
  };
  fillFromHash();
  root.addEventListener('hashchange', fillFromHash);

  $('stamp').addEventListener('click', async () => {
    busy(true);
    say('stampMsg', '캘린더 서버에 보내는 중…');
    try {
      // 주소창 대신 이 칸에 주소 전체를 붙여 넣어도 된다 — 64글자만 골라 쓴다.
      const digestHex = ($('digest').value.match(/[0-9a-f]{64}/i) || [''])[0].toLowerCase();
      const out = await stamp(digestHex, root.fetch.bind(root));
      const b64 = toB64(out.proof);
      showProof(b64);
      remember(digestHex, b64);
      say(
        'stampMsg',
        '도장 요청이 들어갔어요(캘린더 ' + out.accepted + '곳). 비트코인 확정은 보통 몇 시간 걸려요. ' +
          '아래 증명을 복사해 앱의 「증명 붙여넣기」에 넣어 두고, 나중에 「확정 받기」를 눌러 새 증명으로 바꿔 넣어 주세요.' +
          (out.failed.length ? ' 응답 없는 곳: ' + out.failed.join(' / ') : ''),
      );
    } catch (e) {
      say('stampMsg', '도장을 못 찍었어요. ' + e.message, true);
    } finally {
      busy(false);
    }
  });

  $('copy').addEventListener('click', async () => {
    try {
      await root.navigator.clipboard.writeText($('proof').value);
      say('stampMsg', '증명을 복사했어요. 앱의 [설정] → [블록체인 기록] → [증명 붙여넣기]에 넣어 주세요.');
    } catch (e) {
      say('stampMsg', '복사를 못 했어요(' + e.message + '). 증명 칸을 길게 눌러 직접 복사해 주세요.', true);
    }
  });

  $('upgrade').addEventListener('click', async () => {
    busy(true);
    say('checkMsg', '캘린더에 확정됐는지 묻는 중…');
    try {
      const out = await upgrade(fromB64($('proof').value), root.fetch.bind(root));
      const b64 = toB64(out.proof);
      showProof(b64);
      const digestHex = hex((await parseProof(out.proof)).digest);
      remember(digestHex, b64);
      say(
        'checkMsg',
        out.upgraded
          ? '확정된 경로를 ' + out.upgraded + '곳에서 받았어요. 새 증명을 복사해 앱에 다시 붙여넣어 주세요. 이어서 「비트코인에서 확인」을 눌러 보세요.'
          : '아직 확정되지 않았어요. 몇 시간 뒤 다시 눌러 주세요.' +
              (out.failed.length ? ' (' + out.failed.join(' / ') + ')' : ''),
      );
    } catch (e) {
      say('checkMsg', '확정을 받지 못했어요. ' + e.message, true);
    } finally {
      busy(false);
    }
  });

  $('verify').addEventListener('click', async () => {
    busy(true);
    say('checkMsg', '공개 블록 탐색기 두 곳에 블록을 묻는 중…');
    try {
      const out = await verify(fromB64($('proof').value), root.fetch.bind(root));
      if (out.height == null) {
        say('checkMsg', '이 증명서에는 아직 비트코인 블록이 없어요 — 확정 대기 중이에요. 먼저 「확정 받기」를 눌러 주세요.');
        return;
      }
      const lines = out.checks.map((c) =>
        c.error
          ? c.base + ': 확인 못 함(' + c.error + ')'
          : c.base + ': ' + (c.match ? '머클 루트 일치' : '🔴 머클 루트 불일치') + ' · 블록 해시 ' + c.hash.slice(0, 16) + '…',
      );
      const allMatch = out.checks.length && out.checks.every((c) => c.match);
      say(
        'checkMsg',
        (allMatch ? '지문 ' + out.digest.slice(0, 8) + '… 이 비트코인 블록 #' + out.height + ' 에 기록돼 있어요. ' : '블록 #' + out.height + ' 대조 결과: ') +
          lines.join(' / '),
        !allMatch,
      );
    } catch (e) {
      say('checkMsg', '확인하지 못했어요. ' + e.message, true);
    } finally {
      busy(false);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
