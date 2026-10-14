/* ==========================================================================
   Pokémon Crossing Arena — game.js
   GitHub Pages + Firebase(Realtime Database, 익명 인증)만으로 동작하는 클라이언트 버전입니다.
   ========================================================================== */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, remove, onValue, onChildAdded, onChildChanged,
  query, orderByKey, limitToLast,
  onChildRemoved, onDisconnect, serverTimestamp, goOnline, goOffline
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ==========================================================================
   1. 관리자 설정 — 이 영역만 수정하면 됩니다
   ========================================================================== */

// Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱(웹 앱)의 "SDK 설정 및 구성"에서 복사한 값을 붙여 넣으세요.
// 이 값은 공개되어도 되는 "식별용" 값입니다. 데이터베이스 보안은 반드시 Firebase 보안 규칙으로 지켜야 합니다.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBRvtClcXst_FXLjaLXtGFU0IbWUcQ-M2w",


  authDomain: "pokeevent2222-f3c1b.firebaseapp.com",


  databaseURL: "https://pokeevent2222-f3c1b-default-rtdb.asia-southeast1.firebasedatabase.app",


  projectId: "pokeevent2222-f3c1b",


  storageBucket: "pokeevent2222-f3c1b.firebasestorage.app",


  messagingSenderId: "635893544084",


  appId: "1:635893544084:web:e04693e0f4cda443833081"
};

// 결과 화면 "관리자에게 문의하기" 버튼이 열 주소입니다.
// 실제로 사용하는 디스코드 초대 링크, 문의 채널 링크 또는 관리자가 지정한 웹 주소를 넣으세요.
// 비워 두면 문의 버튼이 표시되지 않습니다.
const ADMIN_CONTACT_URL = "";

// 기본 방 코드 (영문 소문자, 숫자, - 만 사용 / 1~20자). 주소 뒤에 ?room=코드 를 붙여 공유할 수도 있습니다.
const DEFAULT_ROOM_ID = "arena";

// 관리자 계정 이메일 — Firebase 콘솔 Authentication에서 직접 만든 계정의 이메일을 넣으세요.
// 화면에서는 이 계정의 "비밀번호만" 입력하면 관리자로 로그인됩니다.
const ADMIN_EMAIL = "";

// 참가자 계정용 내부 이메일 도메인 (닉네임을 이 주소 형식으로 바꿔 Firebase에 저장합니다. 실제 메일은 보내지 않음)
// 운영을 시작한 뒤에는 바꾸지 마세요. 바꾸면 기존 닉네임 계정으로 로그인할 수 없습니다.
const PLAYER_EMAIL_DOMAIN = "players.crossing-arena.example.com";

/* ==========================================================================
   2. 게임 설정
   ========================================================================== */
const GAME = Object.freeze({
  MAX_PLAYERS: 20,
  MIN_PLAYERS: 2,
  COUNTDOWN_MS: 5000,       // 경기 시작 전 카운트다운 (보안 규칙의 60초 제한 이내)
  LATE_JOIN_MS: 3000,       // 출발 신호를 늦게 받은 대기실 참가자도 출발 후 3초까지는 참가 처리
  AWAY_TTL_MS: 1800000,     // 백그라운드 등으로 연결이 끊긴 참가자를 대기실에 유지하는 시간 (30분)
  PRACTICE_COUNTDOWN_MS: 3000,
  MATCH_MS: 180000,         // 경기 시간 (보안 규칙의 endAt = startAt + 180000 과 같아야 함)
  SYNC_INTERVAL_MS: 300,    // 위치 전송 간격 (250~350ms)
  MOVE_COOLDOWN_MS: 140,    // 연속 이동 최소 간격
  HOP_MS: 120,              // 한 칸 점프 시간
  COLS_HALF: 6,             // 이동 가능한 칸: -6 ~ 6 (13칸)
  SPAN: 34,                 // 차량/통나무가 순환하는 가로 길이
  ROWS_AHEAD: 24,
  ROWS_BEHIND: 7,
  BACK_LIMIT: 4,            // 최고 기록에서 뒤로 갈 수 있는 칸 수
  RESULT_GRACE_MS: 2500,    // 경기 종료 후 마지막 기록을 기다리는 시간
  STALE_MS: 5000,
  TRAIN_LEN: 12.6
});

const DEMO_SEED = 20261012;
const IS_TOUCH = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || "ontouchstart" in window;

/* ==========================================================================
   3. 유틸리티
   ========================================================================== */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const mod = (a, n) => ((a % n) + n) % n;
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const num = (v, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const round2 = (v) => Math.round(v * 100) / 100;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function store(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* 저장 불가 환경 무시 */ }
}

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function cleanNickname(s) {
  return String(s || "")
    .replace(/[\u0000-\u001F\u007F<>"'`\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12);
}

function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatSec(ms) {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}초`;
}

function show(id, on = true) {
  $(id).classList.toggle("hidden", !on);
}

let toastTimer = 0;
function toast(msg, ms = 2600) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

let bannerTimer = 0;
function showBanner(title, sub = "", ms = 0) {
  $("banner-title").textContent = title;
  $("banner-sub").textContent = sub;
  show("banner", true);
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => show("banner", false), ms);
}

function hideBanner() {
  clearTimeout(bannerTimer);
  show("banner", false);
}

function detach(list) {
  while (list.length) {
    const fn = list.pop();
    try { fn(); } catch (e) { /* 이미 해제됨 */ }
  }
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(false), ms))]);
}

class UserError extends Error {}

/* ==========================================================================
   4. 저폴리곤 모델 도구 (여러 도형을 하나의 지오메트리로 합쳐 그리기 호출을 줄임)
   ========================================================================== */
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cone: new THREE.ConeGeometry(0.5, 1, 4),
  sphere: new THREE.SphereGeometry(0.5, 10, 8)
};

const _eu = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _sc = new THREE.Vector3();
const _col = new THREE.Color();

// 도형 하나: P(지오메트리, 색, 위치xyz, 크기xyz, 회전xyz)
function P(geo, color, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  _eu.set(rx, ry, rz);
  _q.setFromEuler(_eu);
  return { geo, color, m: new THREE.Matrix4().compose(_p.set(x, y, z), _q, _sc.set(sx, sy, sz)) };
}

function mergeParts(parts) {
  const list = [];
  let total = 0;
  for (const part of parts) {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    g.applyMatrix4(part.m);
    list.push([g, part.color]);
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const [g, color] of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    _col.set(color);
    for (let i = 0; i < n; i++) {
      const j = (o + i) * 3;
      col[j] = _col.r;
      col[j + 1] = _col.g;
      col[j + 2] = _col.b;
    }
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

function shade(hex, f) {
  return new THREE.Color(hex).multiplyScalar(f);
}

const MAT = {
  solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
  ghost: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false }),
  lampOn: new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
  lampOff: new THREE.MeshBasicMaterial({ color: 0x4a2a2a })
};

/* ==========================================================================
   5. 캐릭터 레지스트리
   - 첫 버전은 기본 도형으로 만든 오리지널 동물 캐릭터입니다.
   - 나중에 다른 모델로 바꾸려면 createAvatar()에서 body 대신 GLTFLoader 등으로
     불러온 Group을 넣으면 됩니다. (앞쪽 = -Z 방향, 발바닥 = y 0)
   - 캐릭터 id를 추가/변경하면 Firebase 보안 규칙의 pokemon 정규식도 함께 수정하세요.
   ========================================================================== */
const CHARACTERS = [
  {
    id: "fox", name: "여우", color: "#f08a3c",
    parts() {
      const o = "#ef7d32", w = "#fff4e6", d = "#3a2a22";
      const p = [
        P(GEO.box, o, 0, 0.34, 0.05, 0.52, 0.4, 0.62),
        P(GEO.box, w, 0, 0.3, -0.265, 0.34, 0.26, 0.04),
        P(GEO.box, o, 0, 0.74, -0.12, 0.5, 0.42, 0.44),
        P(GEO.box, w, 0, 0.66, -0.4, 0.26, 0.16, 0.16),
        P(GEO.box, d, 0, 0.71, -0.49, 0.08, 0.06, 0.04),
        P(GEO.box, o, 0, 0.44, 0.46, 0.2, 0.2, 0.4, -0.5, 0, 0),
        P(GEO.box, w, 0, 0.55, 0.65, 0.21, 0.21, 0.12, -0.5, 0, 0)
      ];
      for (const s of [-1, 1]) {
        p.push(
          P(GEO.box, d, s * 0.12, 0.82, -0.345, 0.07, 0.09, 0.02),
          P(GEO.cone, o, s * 0.15, 1.06, -0.1, 0.2, 0.26, 0.16, 0, Math.PI / 4, 0),
          P(GEO.box, d, s * 0.16, 0.08, -0.16, 0.12, 0.16, 0.12),
          P(GEO.box, d, s * 0.16, 0.08, 0.24, 0.12, 0.16, 0.12)
        );
      }
      return p;
    }
  },
  {
    id: "frog", name: "개구리", color: "#5cc46b",
    parts() {
      const g = "#5cc46b", b = "#d7f2b0", w = "#ffffff", k = "#1f2a22", m = "#f28ba8";
      const p = [
        P(GEO.box, g, 0, 0.28, 0.02, 0.7, 0.42, 0.64),
        P(GEO.box, b, 0, 0.24, -0.31, 0.5, 0.26, 0.04),
        P(GEO.box, g, 0, 0.52, -0.08, 0.6, 0.16, 0.5),
        P(GEO.box, m, 0, 0.4, -0.335, 0.34, 0.04, 0.02)
      ];
      for (const s of [-1, 1]) {
        p.push(
          P(GEO.sphere, g, s * 0.2, 0.62, -0.18, 0.24, 0.24, 0.24),
          P(GEO.sphere, w, s * 0.2, 0.66, -0.26, 0.16, 0.16, 0.1),
          P(GEO.box, k, s * 0.2, 0.66, -0.32, 0.07, 0.09, 0.02),
          P(GEO.box, g, s * 0.3, 0.06, -0.2, 0.2, 0.12, 0.24),
          P(GEO.box, g, s * 0.33, 0.08, 0.22, 0.22, 0.16, 0.3)
        );
      }
      return p;
    }
  },
  {
    id: "penguin", name: "펭귄", color: "#3b4a5e",
    parts() {
      const k = "#2b3440", w = "#ffffff", o = "#f5a623", e = "#111418";
      const p = [
        P(GEO.box, k, 0, 0.42, 0.02, 0.54, 0.7, 0.48),
        P(GEO.box, w, 0, 0.38, -0.23, 0.4, 0.54, 0.04),
        P(GEO.box, k, 0, 0.86, 0, 0.46, 0.26, 0.42),
        P(GEO.cone, o, 0, 0.8, -0.3, 0.12, 0.18, 0.12, -Math.PI / 2, Math.PI / 4, 0)
      ];
      for (const s of [-1, 1]) {
        p.push(
          P(GEO.box, w, s * 0.11, 0.88, -0.215, 0.1, 0.1, 0.02),
          P(GEO.box, e, s * 0.11, 0.875, -0.225, 0.05, 0.06, 0.02),
          P(GEO.box, k, s * 0.3, 0.42, 0.02, 0.08, 0.4, 0.26, 0, 0, s * 0.2),
          P(GEO.box, o, s * 0.12, 0.04, -0.12, 0.16, 0.08, 0.22)
        );
      }
      return p;
    }
  },
  {
    id: "bunny", name: "토끼", color: "#f7a8c4",
    parts() {
      const w = "#fafafa", pk = "#f7a8c4", e = "#3b2f3a";
      const p = [
        P(GEO.box, w, 0, 0.3, 0.05, 0.5, 0.42, 0.56),
        P(GEO.box, w, 0, 0.66, -0.12, 0.44, 0.38, 0.4),
        P(GEO.box, pk, 0, 0.62, -0.33, 0.08, 0.06, 0.03),
        P(GEO.sphere, w, 0, 0.36, 0.37, 0.2, 0.2, 0.2)
      ];
      for (const s of [-1, 1]) {
        p.push(
          P(GEO.box, w, s * 0.1, 1.0, -0.06, 0.12, 0.42, 0.08, 0, 0, -s * 0.15),
          P(GEO.box, pk, s * 0.1, 1.0, -0.105, 0.07, 0.32, 0.02, 0, 0, -s * 0.15),
          P(GEO.box, e, s * 0.12, 0.72, -0.325, 0.07, 0.09, 0.02),
          P(GEO.box, w, s * 0.14, 0.06, -0.14, 0.14, 0.12, 0.24)
        );
      }
      return p;
    }
  },
  {
    id: "duck", name: "오리", color: "#ffd54a",
    parts() {
      const y = "#ffd54a", o = "#ff9f1c", d = "#2b2420", wg = "#f2c230";
      const p = [
        P(GEO.box, y, 0, 0.3, 0.06, 0.5, 0.4, 0.62),
        P(GEO.box, y, 0, 0.7, -0.14, 0.38, 0.38, 0.36),
        P(GEO.box, o, 0, 0.62, -0.38, 0.26, 0.08, 0.16),
        P(GEO.box, y, 0, 0.42, 0.42, 0.3, 0.12, 0.12, -0.4, 0, 0)
      ];
      for (const s of [-1, 1]) {
        p.push(
          P(GEO.box, d, s * 0.12, 0.76, -0.325, 0.06, 0.08, 0.02),
          P(GEO.box, wg, s * 0.27, 0.34, 0.08, 0.06, 0.24, 0.38),
          P(GEO.box, o, s * 0.12, 0.03, -0.12, 0.14, 0.06, 0.2)
        );
      }
      return p;
    }
  },
  {
    id: "cat", name: "고양이", color: "#9aa3b5",
    parts() {
      const g = "#9aa3b5", st = "#6b7385", l = "#e8ebf2", pk = "#f28ba8", e = "#3f7d4a";
      const p = [
        P(GEO.box, g, 0, 0.3, 0.06, 0.48, 0.38, 0.62),
        P(GEO.box, g, 0, 0.7, -0.14, 0.48, 0.4, 0.42),
        P(GEO.box, l, 0, 0.62, -0.36, 0.22, 0.12, 0.04),
        P(GEO.box, pk, 0, 0.67, -0.38, 0.06, 0.04, 0.02),
        P(GEO.box, g, 0, 0.55, 0.42, 0.1, 0.5, 0.1, -0.35, 0, 0),
        P(GEO.box, st, 0, 0.78, 0.5, 0.11, 0.1, 0.11, -0.35, 0, 0)
      ];
      for (let k = 0; k < 3; k++) p.push(P(GEO.box, st, 0, 0.495, -0.1 + k * 0.16, 0.5, 0.02, 0.06));
      for (const s of [-1, 1]) {
        p.push(
          P(GEO.cone, g, s * 0.15, 0.98, -0.14, 0.16, 0.2, 0.12, 0, Math.PI / 4, 0),
          P(GEO.box, e, s * 0.12, 0.76, -0.355, 0.08, 0.1, 0.02),
          P(GEO.box, g, s * 0.15, 0.08, -0.16, 0.12, 0.16, 0.12),
          P(GEO.box, g, s * 0.15, 0.08, 0.26, 0.12, 0.16, 0.12)
        );
      }
      return p;
    }
  }
];

const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));
const charGeoCache = new Map();

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// 닉네임은 HTML이 아니라 캔버스에 그려서 표시하므로 스크립트 삽입이 불가능합니다.
function makeLabel(text, isMe) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  g.font = "800 30px 'Noto Sans KR', sans-serif";
  const tw = Math.min(240, g.measureText(text).width + 30);
  g.fillStyle = isMe ? "rgba(255,203,61,0.96)" : "rgba(20,32,64,0.8)";
  roundRect(g, (256 - tw) / 2, 10, tw, 44, 22);
  g.fill();
  g.fillStyle = isMe ? "#1d2b4f" : "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 33, 220);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(1.9, 0.475, 1);
  s.renderOrder = 10;
  return s;
}

function createAvatar(charId, label, isMe) {
  const def = CHAR_BY_ID[charId] || CHARACTERS[0];
  let geo = charGeoCache.get(def.id);
  if (!geo) {
    geo = mergeParts(def.parts());
    charGeoCache.set(def.id, geo);
  }
  const root = new THREE.Group();
  const body = new THREE.Mesh(geo, MAT.solid);
  body.castShadow = true;
  root.add(body);
  let sprite = null;
  if (label) {
    sprite = makeLabel(label, isMe);
    sprite.position.set(0, 1.55, 0);
    root.add(sprite);
  }
  return { root, body, sprite, charId: def.id, label: label || "" };
}

function disposeAvatar(a) {
  if (!a) return;
  if (a.sprite) {
    a.sprite.material.map.dispose();
    a.sprite.material.dispose();
  }
  a.root.removeFromParent();
}

/* ==========================================================================
   6. 차량 · 통나무 · 열차 모델
   ========================================================================== */
const CAR_COLORS = ["#e94b3c", "#3d8bfd", "#ffb300", "#7c4dff", "#26a69a", "#ff7043", "#ec407a"];
const vehicleCache = new Map();
const logCache = new Map();
let trainGeoCache = null;

function vehicleGeo(kind, ci) {
  const key = `${kind}:${ci}`;
  let g = vehicleCache.get(key);
  if (g) return g;
  const c = CAR_COLORS[ci % CAR_COLORS.length];
  const dark = "#262a33", glass = "#dbe9f5", light = "#fff6c2", tail = "#c0392b";
  const p = [];
  if (kind === "truck") {
    p.push(
      P(GEO.box, c, 0.95, 0.52, 0, 0.8, 0.72, 0.86),
      P(GEO.box, glass, 1.36, 0.66, 0, 0.03, 0.28, 0.68),
      P(GEO.box, "#eef1f5", -0.4, 0.66, 0, 1.9, 0.98, 0.92),
      P(GEO.box, c, -0.4, 0.4, 0, 1.92, 0.12, 0.94)
    );
    for (const s of [-1, 1]) p.push(P(GEO.box, light, 1.36, 0.36, s * 0.28, 0.03, 0.1, 0.14));
    for (const x of [0.95, -0.1, -0.95]) p.push(P(GEO.box, dark, x, 0.16, 0, 0.36, 0.32, 0.94));
  } else {
    p.push(
      P(GEO.box, c, 0, 0.34, 0, 1.6, 0.36, 0.84),
      P(GEO.box, glass, -0.08, 0.64, 0, 0.84, 0.26, 0.74),
      P(GEO.box, c, -0.08, 0.8, 0, 0.8, 0.07, 0.76)
    );
    for (const s of [-1, 1]) {
      p.push(
        P(GEO.box, light, 0.8, 0.38, s * 0.27, 0.03, 0.1, 0.16),
        P(GEO.box, tail, -0.8, 0.38, s * 0.27, 0.03, 0.1, 0.16)
      );
    }
    for (const x of [0.5, -0.5]) p.push(P(GEO.box, dark, x, 0.16, 0, 0.36, 0.32, 0.88));
  }
  g = mergeParts(p);
  vehicleCache.set(key, g);
  return g;
}

function logGeo(len) {
  let g = logCache.get(len);
  if (g) return g;
  const p = [P(GEO.cyl, "#8d5a2b", 0, 0, 0, 0.64, len * 0.97, 0.64, 0, 0, Math.PI / 2)];
  for (const s of [-1, 1]) p.push(P(GEO.cyl, "#d4a373", s * len * 0.485, 0, 0, 0.5, 0.03, 0.5, 0, 0, Math.PI / 2));
  for (let k = 1; k < len; k++) p.push(P(GEO.cyl, "#7a4a22", -len / 2 + k, 0, 0, 0.66, 0.06, 0.66, 0, 0, Math.PI / 2));
  g = mergeParts(p);
  logCache.set(len, g);
  return g;
}

// 열차: 앞부분이 x=0, 몸체는 -x 방향으로 약 12.6칸
function trainGeo() {
  if (trainGeoCache) return trainGeoCache;
  const dark = "#2a2d34";
  const p = [
    P(GEO.box, "#d84343", -1.75, 0.78, 0, 3.3, 1.12, 0.92),
    P(GEO.box, "#b53030", -2.9, 1.5, 0, 1.2, 0.42, 0.9),
    P(GEO.box, "#cfe3f1", -2.9, 1.5, 0, 0.9, 0.22, 0.94),
    P(GEO.box, "#ffd54a", -1.75, 0.55, 0, 3.32, 0.1, 0.94),
    P(GEO.box, "#fff3a0", -0.08, 0.9, 0, 0.04, 0.22, 0.46),
    P(GEO.box, dark, -1.75, 0.2, 0, 3.0, 0.3, 0.94)
  ];
  for (let k = 0; k < 2; k++) {
    const cx = -5.75 - 4.35 * k;
    p.push(
      P(GEO.box, k ? "#f2b134" : "#3f8fd8", cx, 0.85, 0, 4.1, 1.15, 0.9),
      P(GEO.box, "#ffffff", cx, 1.0, 0, 4.12, 0.12, 0.92),
      P(GEO.box, dark, cx, 0.2, 0, 3.6, 0.3, 0.94),
      P(GEO.box, dark, cx + 2.15, 0.5, 0, 0.3, 0.12, 0.12)
    );
  }
  trainGeoCache = mergeParts(p);
  return trainGeoCache;
}

/* ==========================================================================
   7. 코스 생성 (맵 시드 기반 — 같은 시드면 모든 참가자가 같은 코스)
   - 장애물 위치는 "경기 시작 후 경과 시간"의 함수라서 모두가 같은 장면을 봅니다.
   ========================================================================== */
class Course {
  constructor(seed) {
    this.rng = mulberry32((seed >>> 0) || 1);
    this.rows = [];
    this.riverDir = 1;
  }

  get(i) {
    while (this.rows.length <= i) this.chunk();
    return this.rows[Math.max(0, i)];
  }

  chunk() {
    const n = this.rows.length;
    const R = this.rng;
    if (n < 5) { this.push("grass"); return; }
    const d = Math.min(1, n / 120);
    const r = R();
    let type, count;
    if (r < 0.36) { type = "road"; count = 1 + Math.floor(R() * (2 + d * 2)); }
    else if (r < 0.52) { type = "rail"; count = R() < 0.2 + d * 0.3 ? 2 : 1; }
    else if (r < 0.75) { type = "river"; count = 1 + Math.floor(R() * (2 + d)); }
    else { type = "grass"; count = 1 + Math.floor(R() * 2); }
    for (let k = 0; k < count; k++) this.push(type);
    if (type !== "grass") this.push("grass");
  }

  push(type) {
    const i = this.rows.length;
    const R = this.rng;
    const d = Math.min(1, i / 120);
    const span = GAME.SPAN;
    const prevPath = i ? this.rows[i - 1].path : 0;
    const path = i < 5 ? 0 : clamp(prevPath + Math.floor(R() * 3) - 1, -4, 4);
    const def = { i, type, path, trees: [], treeSet: new Set(), deco: [] };

    if (type === "grass") {
      if (i >= 5) {
        const n = Math.floor(R() * (2 + d * 3.5));
        for (let k = 0; k < n; k++) {
          const c = Math.floor(R() * (GAME.COLS_HALF * 2 + 1)) - GAME.COLS_HALF;
          const h = R();
          if (Math.abs(c - path) <= 1 || def.treeSet.has(c)) continue; // 통과 경로 보장
          def.treeSet.add(c);
          def.trees.push({ c, h });
        }
      }
      const dn = i < 5 ? 4 : 2;
      for (let k = 0; k < dn; k++) {
        const side = R() < 0.5 ? -1 : 1;
        def.deco.push({ x: side * (GAME.COLS_HALF + 2 + Math.floor(R() * 8)), h: R() });
      }
    } else if (type === "road") {
      def.dir = R() < 0.5 ? 1 : -1;
      def.kind = R() < 0.22 + d * 0.18 ? "truck" : "car";
      def.len = def.kind === "truck" ? 2.8 : 1.6;
      def.speed = 2.2 + R() * 2.2 + d * 3.5;
      def.count = 2 + Math.floor(R() * (2 + d * 1.5));
      def.spacing = span / def.count;
      def.offset = R() * span;
      def.colors = [];
      for (let k = 0; k < def.count; k++) def.colors.push(Math.floor(R() * CAR_COLORS.length));
    } else if (type === "river") {
      this.riverDir = -this.riverDir;
      def.dir = this.riverDir;
      def.len = 2 + Math.floor(R() * 3);
      def.count = Math.max(3, Math.floor(span / (def.len + 1.8 + R() * 2.4 + d * 1.2)));
      def.spacing = span / def.count;
      def.offset = R() * span;
      def.speed = 1.1 + R() * 1.2 + d * 1.4;
    } else {
      def.dir = R() < 0.5 ? 1 : -1;
      def.speed = 30 + d * 10;
      def.period = 6.5 + R() * 5;
      def.warn = 1.6;
      def.phase = R() * def.period;
    }
    this.rows.push(def);
  }
}

function laneX(def, k, t) {
  return mod(def.offset + k * def.spacing + def.dir * def.speed * t, GAME.SPAN) - GAME.SPAN / 2;
}

function trainState(def, t) {
  const c = mod(t + def.phase, def.period);
  const travel = (GAME.SPAN + GAME.TRAIN_LEN + 2) / def.speed;
  const moving = c >= def.warn && c < def.warn + travel;
  const dist = def.speed * (c - def.warn);
  const head = def.dir > 0 ? -GAME.SPAN / 2 - 1 + dist : GAME.SPAN / 2 + 1 - dist;
  const lo = def.dir > 0 ? head - GAME.TRAIN_LEN : head;
  const hi = def.dir > 0 ? head : head + GAME.TRAIN_LEN;
  return { c, warning: c < def.warn + travel, active: moving, head, lo, hi };
}

function hazardAt(def, px, t) {
  if (def.type === "road") {
    for (let k = 0; k < def.count; k++) {
      if (Math.abs(laneX(def, k, t) - px) < def.len / 2 + 0.32) return "car";
    }
  } else if (def.type === "rail") {
    const st = trainState(def, t);
    if (st.active && px > st.lo - 0.3 && px < st.hi + 0.3) return "train";
  }
  return null;
}

function findLog(def, px, t) {
  for (let k = 0; k < def.count; k++) {
    const x = laneX(def, k, t);
    if (Math.abs(x - px) <= def.len / 2 + 0.1) return { k, x };
  }
  return null;
}

function isBlocked(def, col) {
  return def.type === "grass" && def.treeSet.has(col);
}

function groundY(def) {
  if (def.type === "grass") return 0;
  if (def.type === "river") return 0.24;
  return -0.1;
}

/* ==========================================================================
   8. Three.js 장면
   ========================================================================== */
const canvas = $("game-canvas");
const stage = $("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 2, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = IS_TOUCH ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#a6dcf5");
scene.fog = new THREE.Fog("#a6dcf5", 22, 46);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
camera.position.set(3, 10, 8);

const hemi = new THREE.HemisphereLight(0xffffff, 0x7c9a6a, 1.35);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 50;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);

const worldRoot = new THREE.Group();
scene.add(worldRoot);

/* ---------- 줄(Row) 화면 관리: 보이는 범위만 생성하고 지나간 줄은 제거 ---------- */
let course = null;
const rowViews = new Map();

function treeParts(parts, x, h) {
  parts.push(
    P(GEO.box, "#7a5230", x, 0.22, 0, 0.24, 0.44, 0.24),
    P(GEO.box, "#3e9e4f", x, 0.72 + h * 0.15, 0, 0.72, 0.62 + h * 0.3, 0.72),
    P(GEO.box, "#5cbf63", x, 1.15 + h * 0.45, 0, 0.5, 0.36, 0.5)
  );
}

function buildRowStatic(def, next) {
  const parts = [];
  const W = GAME.SPAN + 12;
  const inner = GAME.COLS_HALF * 2 + 1;
  const side = (W - inner) / 2;
  const sx = inner / 2 + side / 2;
  const ground = (color, y, h) => {
    const dark = shade(color, 0.8);
    parts.push(
      P(GEO.box, color, 0, y, 0, inner, h, 1),
      P(GEO.box, dark, -sx, y, 0, side, h, 1),
      P(GEO.box, dark, sx, y, 0, side, h, 1)
    );
  };

  if (def.type === "grass") {
    ground(def.i % 2 ? "#8bd06a" : "#82c662", -0.15, 0.3);
    for (const tr of def.trees) treeParts(parts, tr.c, tr.h);
    for (const dc of def.deco) treeParts(parts, dc.x, dc.h);
  } else if (def.type === "road") {
    ground("#4f5866", -0.2, 0.2);
    if (next && next.type === "road") {
      for (let x = -W / 2 + 1; x < W / 2; x += 2.4) parts.push(P(GEO.box, "#e8edf2", x, -0.095, -0.5, 1.0, 0.012, 0.08));
    }
  } else if (def.type === "rail") {
    ground("#a3927f", -0.2, 0.2);
    for (let x = -W / 2 + 0.4; x < W / 2; x += 0.8) parts.push(P(GEO.box, "#6d4c41", x, -0.08, 0, 0.24, 0.05, 0.82));
    for (const s of [-1, 1]) parts.push(P(GEO.box, "#c7d0d8", 0, -0.02, s * 0.27, W, 0.06, 0.07));
    const px = -(GAME.COLS_HALF + 0.9);
    parts.push(
      P(GEO.box, "#455a64", px, 0.55, 0.42, 0.09, 1.3, 0.09),
      P(GEO.box, "#263238", px, 1.2, 0.42, 0.42, 0.24, 0.1)
    );
  } else {
    ground("#4aaee6", -0.3, 0.2);
  }
  return mergeParts(parts);
}

function createRowView(i) {
  const def = course.get(i);
  const next = course.get(i + 1);
  const group = new THREE.Group();
  group.position.z = -i;
  const stat = new THREE.Mesh(buildRowStatic(def, next), MAT.solid);
  stat.receiveShadow = true;
  stat.castShadow = def.type === "grass";
  group.add(stat);
  const view = { def, group, stat, movers: [], train: null, lamps: [] };

  if (def.type === "road") {
    for (let k = 0; k < def.count; k++) {
      const m = new THREE.Mesh(vehicleGeo(def.kind, def.colors[k]), MAT.solid);
      m.castShadow = true;
      m.position.y = -0.1;
      m.rotation.y = def.dir > 0 ? 0 : Math.PI;
      group.add(m);
      view.movers.push(m);
    }
  } else if (def.type === "river") {
    for (let k = 0; k < def.count; k++) {
      const m = new THREE.Mesh(logGeo(def.len), MAT.solid);
      m.receiveShadow = true;
      m.position.y = -0.05;
      group.add(m);
      view.movers.push(m);
    }
  } else if (def.type === "rail") {
    const tm = new THREE.Mesh(trainGeo(), MAT.solid);
    tm.castShadow = true;
    tm.position.y = -0.1;
    tm.rotation.y = def.dir > 0 ? 0 : Math.PI;
    tm.visible = false;
    group.add(tm);
    view.train = tm;
    for (const s of [-1, 1]) {
      const lamp = new THREE.Mesh(GEO.sphere, MAT.lampOff);
      lamp.scale.setScalar(0.14);
      lamp.position.set(-(GAME.COLS_HALF + 0.9) + s * 0.11, 1.2, 0.49);
      group.add(lamp);
      view.lamps.push(lamp);
    }
  }
  worldRoot.add(group);
  return view;
}

function destroyRowView(v) {
  v.stat.geometry.dispose();
  v.group.removeFromParent();
}

function setCourse(seed) {
  for (const v of rowViews.values()) destroyRowView(v);
  rowViews.clear();
  course = new Course(seed);
}

function syncRowViews(centerRow) {
  const c = Math.max(0, Math.round(centerRow));
  const lo = Math.max(0, c - GAME.ROWS_BEHIND);
  const hi = c + GAME.ROWS_AHEAD;
  for (const [i, v] of rowViews) {
    if (i < lo || i > hi) {
      destroyRowView(v);
      rowViews.delete(i);
    }
  }
  for (let i = lo; i <= hi; i++) {
    if (!rowViews.has(i)) rowViews.set(i, createRowView(i));
  }
}

function updateMovers(t) {
  for (const v of rowViews.values()) {
    const def = v.def;
    if (def.type === "road" || def.type === "river") {
      for (let k = 0; k < v.movers.length; k++) v.movers[k].position.x = laneX(def, k, t);
    } else if (def.type === "rail") {
      const st = trainState(def, t);
      v.train.visible = st.active;
      v.train.position.x = st.head;
      const blink = st.warning && Math.floor(st.c * 6) % 2 === 0;
      v.lamps[0].material = st.warning && blink ? MAT.lampOn : MAT.lampOff;
      v.lamps[1].material = st.warning && !blink ? MAT.lampOn : MAT.lampOff;
    }
  }
}

/* ---------- 파티클 (충돌 효과) ---------- */
const partGeo = new THREE.BoxGeometry(0.13, 0.13, 0.13);
const particles = [];
const particlePool = [];

function burst(pos, colors, n = 14) {
  for (let i = 0; i < n; i++) {
    let p = particlePool.pop();
    if (!p) p = new THREE.Mesh(partGeo, new THREE.MeshLambertMaterial());
    p.material.color.set(colors[i % colors.length]);
    p.position.set(pos.x, pos.y + 0.4, pos.z);
    p.scale.setScalar(1);
    p.userData.v = new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4);
    p.userData.life = 0.6 + Math.random() * 0.4;
    scene.add(p);
    particles.push(p);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    const v = p.userData.v;
    v.y -= 9.8 * dt;
    p.position.addScaledVector(v, dt);
    p.userData.life -= dt;
    p.scale.setScalar(Math.max(0.01, p.userData.life));
    if (p.userData.life <= 0) {
      p.removeFromParent();
      particles.splice(i, 1);
      particlePool.push(p);
    }
  }
}

function deathFx(pos, cause) {
  if (cause === "water" || cause === "edge") burst(pos, ["#ffffff", "#bfe8ff", "#4aaee6"], 16);
  else burst(pos, ["#ffffff", "#ffcb3d", "#ef4b4b"], 16);
}

/* ==========================================================================
   9. 게임 상태
   ========================================================================== */
const S = {
  mode: "menu",            // menu | lobby | match | result
  practice: false,
  uid: null,
  session: Math.random().toString(36).slice(2, 12),
  nickname: "",
  charId: "fox",
  roomId: "",
  inRoom: false,
  leaving: false,
  busy: false,
  isAdmin: false,        // Firebase admins/{uid} = true 로 등록된 계정만 true
  adminSpectate: false,  // 관리자가 경기에 참가하지 않고 진행만 하는 경우
  serverOffset: 0,
  connected: false,
  everConnected: false,
  netDown: false,
  myNodeMissing: false,
  joinSnapshotMine: null,
  room: { hostId: null, status: null, startAt: 0, endAt: 0, mapSeed: 0, round: 0 },
  players: new Map(),
  unsubRoom: [],
  unsubPlayers: [],
  unsubInfo: [],
  match: null,
  syncTimer: 0,
  dirty: false,
  lobbyDirty: true,
  shake: 0
};

const me = {
  row: 0, x: 0, maxRow: 0, dispRow: 0, deadRow: 0,
  alive: false, active: false, log: null, hop: null, queued: null,
  lastMoveAt: 0, reachedAt: 0, survivalMs: 0, cause: "",
  face: 0, faceCur: 0, deadAt: 0, deathStyle: "flat", pendingDrown: false, bumpT: 0,
  avatar: null
};

const remotes = new Map();
const lobbyAvatars = new Map();
let preview = null;

const serverNow = () => Date.now() + S.serverOffset;
const roomPath = () => `rooms/${S.roomId}`;
const myPath = () => `rooms/${S.roomId}/players/${S.uid}`;
const isHost = () => S.practice || (S.uid && S.room.hostId === S.uid);

const CAUSE_TEXT = {
  car: "차량과 부딪혔어요",
  train: "열차와 부딪혔어요",
  water: "강에 빠졌어요",
  edge: "물살에 떠내려갔어요",
  left: "경기에서 나갔어요"
};

const RESULT_TEXT = {
  car: "차량 충돌",
  train: "열차 충돌",
  water: "강에 빠짐",
  edge: "떠내려감",
  left: "중도 이탈"
};

const FACE = { up: 0, down: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
const START_COLS = [0, -2, 2, -4, 4, -1, 1, -3, 3, -5, 5, -6, 6];
const ROOM_KEYS = ["hostId", "status", "startAt", "endAt", "mapSeed", "round"];

/* ==========================================================================
   10. Firebase
   ========================================================================== */
const FIREBASE_READY = Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL && FIREBASE_CONFIG.projectId);
let fbApp = null;
let fbAuth = null;
let db = null;

if (FIREBASE_READY) {
  try {
    fbApp = initializeApp(FIREBASE_CONFIG);
    fbAuth = getAuth(fbApp);
    db = getDatabase(fbApp);
    goOffline(db); // 방에 들어가기 전에는 연결하지 않음
  } catch (e) {
    console.error("Firebase 초기화 실패", e);
    db = null;
  }
}

function dbUpdate(path, data) {
  if (S.practice || !db) return Promise.resolve(true);
  return update(ref(db, path), data)
    .then(() => true)
    .catch((e) => {
      console.warn("[Firebase 쓰기 실패]", path, e && e.code ? e.code : e);
      return false;
    });
}

// .info/connected, 서버 시간 오프셋 구독. 처음 연결되면 resolve.
function attachInfoListeners() {
  detach(S.unsubInfo);
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
    S.unsubInfo.push(onValue(ref(db, ".info/serverTimeOffset"), (s) => {
      S.serverOffset = num(s.val(), 0);
    }));
    S.unsubInfo.push(onValue(ref(db, ".info/connected"), (s) => {
      const c = s.val() === true;
      S.connected = c;
      if (c) {
        const recovered = S.netDown;
        S.everConnected = true;
        S.netDown = false;
        show("net-banner", false);
        if (S.inRoom) registerPresence();
        if (recovered && S.inRoom) toast("연결이 복구되었습니다.");
        finish(true);
      } else if (S.everConnected && S.inRoom) {
        S.netDown = true;
        show("net-banner", true);
      }
    }));
    setTimeout(() => finish(false), 8000);
  });
}

function attachRoomListeners() {
  detach(S.unsubRoom);
  S.roomLoaded = new Set();
  for (const key of ROOM_KEYS) {
    S.unsubRoom.push(onValue(ref(db, `${roomPath()}/${key}`), (s) => {
      S.room[key] = s.val();
      S.roomLoaded.add(key);
      scheduleRoomApply();
    }));
  }
}

// 참가자는 child 이벤트로만 구독 → 바뀐 참가자 한 명의 데이터만 내려받음
function attachPlayerListeners() {
  detach(S.unsubPlayers);
  S.players.clear();
  if (S.practice || !db) return;
  const pr = ref(db, `${roomPath()}/players`);
  S.unsubPlayers.push(onChildAdded(pr, (s) => onPlayerData(s.key, s.val())));
  S.unsubPlayers.push(onChildChanged(pr, (s) => onPlayerData(s.key, s.val())));
  S.unsubPlayers.push(onChildRemoved(pr, (s) => onPlayerRemoved(s.key)));
}

function freshPlayerFields() {
  return {
    joinedAt: serverTimestamp(),
    round: 0, x: 0, z: 0, distance: 0, alive: false,
    survivalMs: 0, reachedAt: 0, cause: "", finished: false
  };
}

function statePayload() {
  return {
    round: S.match ? S.match.round : 0,
    x: round2(me.x),
    z: me.row,
    distance: me.maxRow,
    alive: me.alive,
    survivalMs: me.survivalMs,
    reachedAt: me.reachedAt,
    cause: me.cause,
    updatedAt: serverTimestamp()
  };
}

// 접속 상태 기록 + 연결 끊김 시 처리(onDisconnect) 등록. 재연결 때마다 다시 호출됨.
function registerPresence() {
  if (!S.inRoom || S.practice || !db || S.leaving) return;
  const r = ref(db, myPath());
  const keepNode = Boolean(S.match && S.match.participant && (S.mode === "match" || S.mode === "result"));
  const od = onDisconnect(r);
  od.cancel()
    // 연결이 끊겨도(앱 전환·화면 꺼짐) 기록을 지우지 않고 '자리 비움'으로만 표시 → 돌아오면 그대로 대기실 유지
    .then(() => od.update({ online: false, updatedAt: serverTimestamp() }))
    .catch((e) => console.warn("onDisconnect 등록 실패", e));
  const data = {
    nickname: S.nickname, pokemon: S.charId, online: true, session: S.session, updatedAt: serverTimestamp(),
    admin: S.isAdmin, spectator: Boolean(S.isAdmin && S.adminSpectate)
  };
  if (S.myNodeMissing && !keepNode) Object.assign(data, freshPlayerFields());
  if (keepNode) Object.assign(data, statePayload());
  if (S.myNodeMissing && keepNode) data.joinedAt = serverTimestamp();
  S.myNodeMissing = false;
  dbUpdate(myPath(), data);
}

/* ---------- 로그인 ----------
   - 참가자: 닉네임 + 비밀번호. 닉네임을 내부 이메일(해시값@PLAYER_EMAIL_DOMAIN)로 바꿔 Firebase 계정을 만듭니다.
     처음 쓰는 닉네임이면 자동으로 계정이 만들어지고, 이후에는 같은 비밀번호로만 그 닉네임을 쓸 수 있습니다.
   - 관리자: 비밀번호만 입력. ADMIN_EMAIL 계정으로 로그인하며, admins/{UID} = true 로 등록되어 있어야
     경기를 시작할 수 있습니다. (화면 버튼뿐 아니라 보안 규칙에서도 막힘)
------------------------------------- */
const MIN_PASSWORD = 6;

function isAdminAccount(user) {
  const want = String(ADMIN_EMAIL || "").trim().toLowerCase();
  return Boolean(want && user && user.email && user.email.toLowerCase() === want);
}

function currentPlayerAccount() {
  const user = fbAuth ? fbAuth.currentUser : null;
  return user && !isAdminAccount(user) ? user : null;
}

async function nicknameToEmail(nick) {
  if (!window.crypto || !window.crypto.subtle) {
    throw new UserError("이 브라우저에서는 로그인을 사용할 수 없습니다. https 주소(GitHub Pages)로 접속해 주세요.");
  }
  const norm = nick.normalize("NFC").toLowerCase();
  const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `p${hex.slice(0, 40)}@${PLAYER_EMAIL_DOMAIN}`;
}

// 표시 이름(닉네임)을 계정에 저장하고 토큰을 새로 받아 보안 규칙(auth.token.name)에 반영
async function setDisplayName(user, name) {
  await updateProfile(user, { displayName: name });
  await user.getIdToken(true);
}

function authErrorText(e) {
  const code = (e && e.code) || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "비밀번호가 올바르지 않습니다.";
  if (code.includes("weak-password")) return `비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`;
  if (code.includes("operation-not-allowed")) return "Firebase 콘솔에서 이메일/비밀번호 로그인이 꺼져 있습니다.";
  if (code.includes("too-many-requests")) return "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  if (code.includes("network-request-failed")) return "네트워크 오류로 로그인하지 못했습니다.";
  return `로그인하지 못했습니다. (${code || (e && e.message) || "알 수 없는 오류"})`;
}

async function signInPlayer(nick, pw) {
  const email = await nicknameToEmail(nick);
  const cur = fbAuth.currentUser;
  if (cur && cur.email === email) {
    if (!cur.displayName) await setDisplayName(cur, nick);
    return cur;
  }
  if (!pw) throw new UserError("비밀번호를 입력해 주세요.");
  if (pw.length < MIN_PASSWORD) throw new UserError(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`);
  if (cur) await signOut(fbAuth);
  try {
    const cred = await signInWithEmailAndPassword(fbAuth, email, pw);
    if (!cred.user.displayName) await setDisplayName(cred.user, nick);
    return cred.user;
  } catch (e) {
    const code = (e && e.code) || "";
    const maybeNew = code.includes("invalid-credential") || code.includes("user-not-found") || code.includes("wrong-password");
    if (!maybeNew) throw new UserError(authErrorText(e));
    // 로그인 실패 → 처음 쓰는 닉네임이면 새 계정 생성
    try {
      const cred = await createUserWithEmailAndPassword(fbAuth, email, pw);
      await setDisplayName(cred.user, nick);
      toast(`'${nick}' 닉네임이 등록되었습니다. 다음에도 같은 비밀번호로 로그인하세요.`, 4000);
      return cred.user;
    } catch (e2) {
      const c2 = (e2 && e2.code) || "";
      if (c2.includes("email-already-in-use")) throw new UserError("이미 다른 사람이 쓰는 닉네임이거나 비밀번호가 틀렸습니다.");
      throw new UserError(authErrorText(e2));
    }
  }
}

async function playerLogout() {
  if (!fbAuth || S.inRoom) return;
  try { await signOut(fbAuth); } catch (e) { /* 무시 */ }
  $("input-password").value = "";
  refreshSessionUi();
  refreshAdminUi();
}

// 이미 로그인된 닉네임이면 비밀번호 칸을 숨김
function refreshSessionUi() {
  if (!fbAuth) { show("player-session", false); return; }
  const cur = fbAuth.currentUser;
  const player = currentPlayerAccount();
  const typed = cleanNickname($("input-nickname").value);
  if (player && player.displayName) {
    $("player-session-text").textContent = `'${player.displayName}' 계정으로 로그인되어 있습니다.`;
    show("player-session", true);
  } else {
    show("player-session", false);
  }
  const admin = isAdminAccount(cur);
  const sameAccount = Boolean(player && player.displayName && typed.toLowerCase() === player.displayName.toLowerCase());
  show("password-field", !admin && !sameAccount);
  $("nickname-label").textContent = admin ? "관리자 표시 이름" : "닉네임";
}

async function fetchAdminFlag(user) {
  if (!db || !user || !isAdminAccount(user)) return false;
  try {
    const s = await get(ref(db, `admins/${user.uid}`));
    return s.val() === true;
  } catch (e) {
    return false;
  }
}

async function refreshAdminUi() {
  if (!String(ADMIN_EMAIL || "").trim()) {
    show("admin-box", false);
    S.isAdmin = false;
    return;
  }
  const user = fbAuth ? fbAuth.currentUser : null;
  const signedIn = isAdminAccount(user);
  show("admin-login-form", !signedIn);
  show("admin-signed-in", signedIn);
  refreshSessionUi();
  if (!signedIn) {
    S.isAdmin = false;
    $("admin-box-label").textContent = "관리자 로그인";
    return;
  }
  $("admin-uid").textContent = user.uid;
  $("admin-status").textContent = "관리자 권한을 확인하는 중…";
  leaseOnline();
  const ok = await fetchAdminFlag(user);
  releaseOnline();
  S.isAdmin = ok;
  $("admin-box-label").textContent = ok ? "관리자로 로그인됨" : "관리자 로그인 (권한 없음)";
  $("admin-status").textContent = ok
    ? "관리자로 로그인했습니다. 위의 닉네임 칸에 표시 이름을 적고 대기실에 입장하면 경기 시작 버튼이 보입니다."
    : "로그인은 되었지만 관리자로 등록되지 않았습니다. Firebase 콘솔 데이터 탭에서 admins 아래에 아래 UID를 true 로 추가해 주세요.";
}

async function adminLogin() {
  if (!fbAuth || S.inRoom) return;
  const pw = $("input-admin-password").value;
  const err = $("admin-error");
  err.textContent = "";
  if (!pw) { err.textContent = "관리자 비밀번호를 입력해 주세요."; return; }
  $("btn-admin-login").disabled = true;
  try {
    if (fbAuth.currentUser) await signOut(fbAuth);
    const cred = await signInWithEmailAndPassword(fbAuth, ADMIN_EMAIL.trim(), pw);
    if (!cred.user.displayName) await setDisplayName(cred.user, "관리자");
    $("input-admin-password").value = "";
    if (!cleanNickname($("input-nickname").value)) $("input-nickname").value = cred.user.displayName || "관리자";
    await refreshAdminUi();
  } catch (e) {
    err.textContent = authErrorText(e);
  } finally {
    $("btn-admin-login").disabled = false;
  }
}

async function adminLogout() {
  if (!fbAuth || S.inRoom) return;
  try { await signOut(fbAuth); } catch (e) { /* 무시 */ }
  S.isAdmin = false;
  S.adminSpectate = false;
  $("input-admin-spectate").checked = false;
  await refreshAdminUi();
}

// 입장 쓰기가 거부되었을 때 원인을 좁혀서 안내
async function diagnoseJoinFailure(user, err) {
  const code = (err && (err.code || err.message)) || "알 수 없는 오류";
  try {
    const tok = await user.getIdTokenResult(true);
    if (tok.signInProvider !== "password") {
      return `방에 입장하지 못했습니다. 로그인 방식이 이메일/비밀번호가 아닙니다(${tok.signInProvider}). 로그아웃 후 닉네임과 비밀번호로 다시 로그인해 주세요.`;
    }
    if (!tok.claims.name || tok.claims.name !== S.nickname) {
      return "방에 입장하지 못했습니다. 계정의 닉네임 정보가 아직 반영되지 않았습니다. 새로고침 후 다시 시도해 주세요.";
    }
  } catch (e) { /* 토큰 확인 실패는 무시하고 다음 단계 진행 */ }
  try {
    await get(ref(db, `admins/${user.uid}`));
  } catch (e) {
    return "방에 입장하지 못했습니다. Firebase 보안 규칙이 최신 버전이 아닙니다. README 4단계의 규칙 전체를 Realtime Database → 규칙 탭에 덮어쓰고 '게시'를 눌러 주세요. (PERMISSION_DENIED)";
  }
  return `방에 입장하지 못했습니다. Firebase 보안 규칙을 README 4단계와 똑같이 붙여 넣었는지, 이메일/비밀번호 로그인이 켜져 있는지 확인해 주세요. (${code})`;
}

/* ---------- 최근 경기 1등 기록 ----------
   경기가 끝나면 관리자 브라우저만 rooms/{방}/history/{회차} 에 상위 3명을 저장합니다. (보안 규칙도 관리자만 허용)
   메인 화면에서는 로그인 없이 최근 5회의 1등을 볼 수 있습니다.
------------------------------------------ */
const HISTORY_SHOW = 5;
const HISTORY_KEEP = 30;
let historyTimer = 0;
let historySeq = 0;
let onlineLeases = 0;

// 방 밖에서 잠깐 데이터베이스에 연결했다가 끊기
function leaseOnline() {
  onlineLeases++;
  goOnline(db);
}

function releaseOnline() {
  onlineLeases = Math.max(0, onlineLeases - 1);
  if (!onlineLeases && !S.inRoom) goOffline(db);
}

function saveHistory(m, list) {
  if (S.practice || !db || !S.isAdmin || !list.length) return;
  const top = list.slice(0, 3).map((e) => ({
    nickname: e.nickname,
    distance: e.distance,
    survivalMs: Math.round(e.survivalMs),
    result: outcomeText(e)
  }));
  const base = `${roomPath()}/history`;
  set(ref(db, `${base}/${m.round}`), {
    round: m.round,
    endedAt: serverTimestamp(),
    count: list.length,
    top
  }).catch((e) => console.warn("기록 저장 실패", e && e.code));
  if (m.round > HISTORY_KEEP) remove(ref(db, `${base}/${m.round - HISTORY_KEEP}`)).catch(() => {});
}

function formatDate(ms) {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function renderHistory(roomId, rows, message) {
  $("history-room").textContent = roomId || "-";
  const ol = $("history-list");
  ol.textContent = "";
  $("history-empty").textContent = message || "";
  show("history-empty", Boolean(message));
  for (const h of rows) {
    const first = Array.isArray(h.top) ? h.top[0] : (h.top && h.top[0]);
    if (!first) continue;
    const li = document.createElement("li");
    const rd = document.createElement("span");
    rd.className = "h-round";
    rd.textContent = `${num(h.round)}회`;
    const nm = document.createElement("span");
    nm.className = "h-name";
    nm.textContent = cleanNickname(first.nickname) || "참가자";
    const st = document.createElement("span");
    st.className = "h-stat";
    st.textContent = `${num(first.distance)}칸 · ${formatSec(num(first.survivalMs))}`;
    const dt = document.createElement("span");
    dt.className = "h-date";
    dt.textContent = `${formatDate(num(h.endedAt))} · ${num(h.count)}명`;
    li.append(rd, nm, st, dt);
    ol.append(li);
  }
}

async function loadHistory() {
  if (!FIREBASE_READY || !db) { show("history-box", false); return; }
  if (S.mode !== "menu") return;
  const roomId = $("input-room").value.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,20}$/.test(roomId)) { renderHistory(roomId, [], "올바른 방 코드를 입력하면 기록이 표시됩니다."); return; }
  const seq = ++historySeq;
  renderHistory(roomId, [], "불러오는 중…");
  leaseOnline();
  try {
    const snap = await get(query(ref(db, `rooms/${roomId}/history`), orderByKey(), limitToLast(HISTORY_SHOW)));
    if (seq !== historySeq) return;
    const rows = [];
    snap.forEach((c) => { const v = c.val(); if (v && typeof v === "object") rows.push(v); });
    rows.sort((a, b) => num(b.round) - num(a.round));
    renderHistory(roomId, rows, rows.length ? "" : "아직 기록된 경기가 없습니다.");
  } catch (e) {
    if (seq === historySeq) renderHistory(roomId, [], "기록을 불러오지 못했습니다. 보안 규칙(history)을 확인해 주세요.");
  } finally {
    releaseOnline();
  }
}

/* ---------- 백그라운드 · 새로고침 후 대기실 복귀 ----------
   휴대폰 브라우저는 백그라운드로 간 탭의 연결을 끊거나 페이지를 다시 불러오기도 합니다.
   - 연결만 끊긴 경우: Firebase가 자동 재연결 → registerPresence()가 '접속 중'으로 되돌림
   - 페이지가 새로 열린 경우: 이 탭에서 입장했던 방을 기억해 두었다가 자동으로 다시 입장
------------------------------------------------------------ */
const ACTIVE_ROOM_KEY = "pca.activeRoom";

function rememberActiveRoom() {
  try {
    sessionStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify({ room: S.roomId, spectate: S.adminSpectate, at: Date.now() }));
  } catch (e) { /* 저장 불가 환경 무시 */ }
}

function forgetActiveRoom() {
  try { sessionStorage.removeItem(ACTIVE_ROOM_KEY); } catch (e) { /* 무시 */ }
}

function readActiveRoom() {
  try {
    const v = JSON.parse(sessionStorage.getItem(ACTIVE_ROOM_KEY) || "null");
    if (!v || !/^[a-z0-9-]{1,20}$/.test(v.room) || Date.now() - num(v.at) > GAME.AWAY_TTL_MS) return null;
    return v;
  } catch (e) {
    return null;
  }
}

async function resumeActiveRoom() {
  const saved = readActiveRoom();
  if (!saved || S.inRoom || !FIREBASE_READY || !fbAuth) return;
  const user = fbAuth.currentUser;
  const admin = isAdminAccount(user);
  const player = currentPlayerAccount();
  if (!admin && !(player && player.displayName)) { forgetActiveRoom(); return; }
  $("input-room").value = saved.room;
  if (player) $("input-nickname").value = player.displayName;
  if (!cleanNickname($("input-nickname").value)) $("input-nickname").value = (user && user.displayName) || "관리자";
  $("input-admin-spectate").checked = Boolean(admin && saved.spectate);
  await joinRoom();
  if (S.inRoom) toast("이전에 입장한 대기실에 다시 연결했어요.");
  else forgetActiveRoom();
}

// 화면으로 돌아왔을 때 연결을 즉시 다시 시도
function onReturnToPage() {
  if (!S.inRoom || S.practice || !db) return;
  goOnline(db);
  if (S.connected) registerPresence();
}

/* ---------- 방 입장 ---------- */
async function joinRoom() {
  if (S.busy || S.inRoom) return;
  const nick = cleanNickname($("input-nickname").value);
  const roomId = $("input-room").value.trim().toLowerCase();
  if (!nick) return menuError("닉네임을 입력해 주세요.");
  if (!/^[a-z0-9-]{1,20}$/.test(roomId)) return menuError("방 코드는 영문 소문자, 숫자, - 로 1~20자까지 입력해 주세요.");
  if (!FIREBASE_READY || !db) return menuError("Firebase 설정이 비어 있습니다. game.js 상단의 FIREBASE_CONFIG를 입력하거나 '혼자 연습하기'를 이용해 주세요.");

  S.busy = true;
  setJoinBusy(true);
  menuError("");
  try {
    S.roomId = roomId;
    S.practice = false;
    store("pca.room", roomId);
    store("pca.char", S.charId);

    // 로그인: 관리자는 이미 로그인된 상태, 참가자는 닉네임 + 비밀번호
    let user;
    const cur = fbAuth.currentUser;
    if (isAdminAccount(cur)) {
      user = cur;
      if (nick !== user.displayName) await setDisplayName(user, nick);
    } else {
      user = await signInPlayer(nick, $("input-password").value);
    }
    $("input-password").value = "";
    S.nickname = cleanNickname(user.displayName) || nick;
    $("input-nickname").value = S.nickname;
    store("pca.nickname", S.nickname);
    refreshSessionUi();
    S.uid = user.uid;
    // 닉네임이 담긴 최신 로그인 토큰으로 데이터베이스에 연결 (보안 규칙의 auth.token.name 검사용)
    await user.getIdToken(true);
    goOnline(db);
    const connected = await attachInfoListeners();
    if (!connected) throw new UserError("Firebase에 연결할 수 없습니다. 인터넷 연결과 databaseURL 설정을 확인해 주세요.");

    S.isAdmin = await fetchAdminFlag(user);
    S.adminSpectate = S.isAdmin && $("input-admin-spectate").checked;

    const snap = await get(ref(db, roomPath()));
    const room = snap.val() || {};
    const players = room.players || {};
    const now = serverNow();
    const mine = players[S.uid] || null;
    const onlineOthers = Object.entries(players).filter(([id, p]) => id !== S.uid && p && p.spectator !== true && isPresent(p, now));
    const countsAsRacer = !S.adminSpectate;
    if (!mine && countsAsRacer && onlineOthers.length >= GAME.MAX_PLAYERS) throw new UserError(`방이 가득 찼습니다. (최대 ${GAME.MAX_PLAYERS}명)`);

    const active = room.status === "countdown" || room.status === "playing";
    const stale = active && (!room.endAt || now > room.endAt + GAME.STALE_MS);
    const host = room.hostId ? players[room.hostId] : null;
    const hostValid = Boolean(host && host.online === true && room.hostId !== S.uid);
    const takeHost = !hostValid;

    const base = `players/${S.uid}`;
    const payload = {
      [`${base}/nickname`]: S.nickname,
      [`${base}/pokemon`]: S.charId,
      [`${base}/online`]: true,
      [`${base}/session`]: S.session,
      [`${base}/updatedAt`]: serverTimestamp(),
      [`${base}/admin`]: S.isAdmin,
      [`${base}/spectator`]: Boolean(S.isAdmin && S.adminSpectate)
    };
    if (!mine) {
      for (const [k, v] of Object.entries(freshPlayerFields())) payload[`${base}/${k}`] = v;
    }
    if (takeHost) {
      payload.hostId = S.uid;
      if (room.status == null) payload.status = "lobby";
      else if (stale) payload.status = "ended";
      if (room.round == null) payload.round = 0;
      if (room.mapSeed == null) payload.mapSeed = 0;
      if (room.createdAt == null) payload.createdAt = serverTimestamp();
    }

    try {
      await update(ref(db, roomPath()), payload);
    } catch (e) {
      throw new UserError(await diagnoseJoinFailure(user, e));
    }

    // 진행 중인 경기가 없으면 나간 참가자와 30분 넘게 자리를 비운 참가자 데이터만 정리
    if (!active || (stale && takeHost)) {
      for (const [id, p] of Object.entries(players)) {
        if (id === S.uid || !p || p.online !== false) continue;
        if (p.cause === "left" || now - num(p.updatedAt) > GAME.AWAY_TTL_MS) {
          remove(ref(db, `${roomPath()}/players/${id}`)).catch(() => {});
        }
      }
    }

    S.joinSnapshotMine = mine;
    S.inRoom = true;
    S.leaving = false;
    S.myNodeMissing = false;
    S.room = { hostId: null, status: null, startAt: 0, endAt: 0, mapSeed: 0, round: 0 };
    attachPlayerListeners();
    attachRoomListeners();
    S.mode = "lobby";
    registerPresence();
    rememberActiveRoom();
    showScreen("lobby");
  } catch (e) {
    console.error(e);
    detach(S.unsubInfo);
    detach(S.unsubRoom);
    detach(S.unsubPlayers);
    if (db) goOffline(db);
    S.inRoom = false;
    menuError(e instanceof UserError ? e.message : `입장 중 오류가 발생했습니다. (${e.code || e.message})`);
  } finally {
    S.busy = false;
    setJoinBusy(false);
  }
}

function onPlayerData(uid, val) {
  if (!val || typeof val !== "object") return;
  const prev = S.players.get(uid) || null;
  const p = Object.assign({ uid }, val);
  S.players.set(uid, p);
  if (uid === S.uid) {
    S.myNodeMissing = false;
    if (p.session && p.session !== S.session && !S.leaving) {
      kicked();
      return;
    }
  } else if (S.mode === "match") {
    syncRemote(p, prev);
  }
  S.lobbyDirty = true;
  scheduleHostCheck();
}

function onPlayerRemoved(uid) {
  S.players.delete(uid);
  removeRemote(uid);
  if (uid === S.uid && S.inRoom && !S.leaving) {
    S.myNodeMissing = true;
    if (S.connected) registerPresence();
  }
  S.lobbyDirty = true;
  scheduleHostCheck();
}

function kicked() {
  leaveRoom({ keepNode: true, message: "같은 닉네임 계정으로 다른 기기나 탭에서 접속해 이 창의 연결을 종료했습니다." });
}

/* ---------- 방장 승계 ---------- */
let hostCheckTimer = 0;
function scheduleHostCheck() {
  clearTimeout(hostCheckTimer);
  hostCheckTimer = setTimeout(checkHost, 700);
}

function onlinePlayers() {
  return [...S.players.values()]
    .filter((p) => p.online !== false)
    .sort((a, b) => num(a.joinedAt, 9e15) - num(b.joinedAt, 9e15) || a.uid.localeCompare(b.uid));
}

// 대기실에 있는 사람: 접속 중이거나, 잠깐 자리를 비운 사람(앱 전환 등, 30분 이내)
function isPresent(p, now) {
  if (p.online !== false) return true;
  if (p.cause === "left") return false;
  return now - num(p.updatedAt) < GAME.AWAY_TTL_MS;
}

function lobbyPlayers() {
  const now = serverNow();
  return [...S.players.values()]
    .filter((p) => isPresent(p, now))
    .sort((a, b) => num(a.joinedAt, 9e15) - num(b.joinedAt, 9e15) || a.uid.localeCompare(b.uid));
}

// 경기에 실제로 뛰는 사람 (진행만 하는 관리자 제외)
function racers() {
  return onlinePlayers().filter((p) => p.spectator !== true);
}

function checkHost() {
  if (!S.inRoom || S.practice || !db || S.leaving) return;
  if (S.mode !== "lobby" && S.mode !== "match") return;
  const h = S.room.hostId ? S.players.get(S.room.hostId) : null;
  if (h && h.online !== false) return;
  const cands = onlinePlayers();
  if (cands.length && cands[0].uid === S.uid) dbUpdate(roomPath(), { hostId: S.uid });
}

/* ---------- 방 상태 반영 ---------- */
// 방 필드는 각각 따로 도착하므로, 잠깐 모았다가 한 번에 반영합니다.
let roomApplyQueued = false;
function scheduleRoomApply() {
  if (roomApplyQueued) return;
  roomApplyQueued = true;
  setTimeout(applyRoom, 150);
}

function roomIsActive() {
  const r = S.room;
  return (r.status === "countdown" || r.status === "playing") && num(r.endAt) > 0 && serverNow() < num(r.endAt) + GAME.STALE_MS;
}

function applyRoom() {
  roomApplyQueued = false;
  if (!S.inRoom || S.practice) return;
  if (!S.roomLoaded || S.roomLoaded.size < ROOM_KEYS.length) return;
  const r = S.room;
  const consistent = num(r.startAt) > 0 && num(r.endAt) === num(r.startAt) + GAME.MATCH_MS && r.mapSeed != null;
  if (S.mode === "lobby" && roomIsActive() && num(r.round) > 0 && consistent) {
    const now = serverNow();
    const mine = S.players.get(S.uid) || S.joinSnapshotMine;
    const sameRound = Boolean(mine && mine.round === r.round);
    if (S.isAdmin && S.adminSpectate) enterMatch("spectate", null);
    else if (sameRound && mine.alive === true) enterMatch("play", mine);
    else if (sameRound) enterMatch("spectate", null);
    // 출발 신호를 조금 늦게 받아도(백그라운드, 느린 인터넷) 출발 후 몇 초까지는 참가자로 출발
    else if (now < r.startAt + GAME.LATE_JOIN_MS) enterMatch("play", null);
    else enterMatch("spectate", null);
  }
  S.joinSnapshotMine = null;
  S.lobbyDirty = true;
}

// 경기 시작은 관리자만 가능 (보안 규칙에서도 관리자 UID만 허용)
function adminStart() {
  if (!S.isAdmin || S.mode !== "lobby") return;
  if (roomIsActive()) { toast("이미 경기가 진행 중입니다."); return; }
  const count = racers().length;
  if (count < GAME.MIN_PLAYERS) { toast(`참가자가 ${GAME.MIN_PLAYERS}명 이상이어야 시작할 수 있어요.`); return; }
  const start = Math.round(serverNow() + GAME.COUNTDOWN_MS);
  $("btn-start").disabled = true;
  dbUpdate(roomPath(), {
    status: "countdown",
    round: num(S.room.round) + 1,
    mapSeed: Math.floor(Math.random() * 2147483647),
    startAt: start,
    endAt: start + GAME.MATCH_MS
  }).then((ok) => {
    $("btn-start").disabled = false;
    if (!ok) toast("경기를 시작하지 못했습니다. 관리자 등록(admins)과 보안 규칙을 확인해 주세요.");
  });
}

/* ==========================================================================
   11. 경기 진행
   ========================================================================== */
function startColumn() {
  const list = racers();
  const idx = Math.max(0, list.findIndex((p) => p.uid === S.uid));
  return START_COLS[idx % START_COLS.length];
}

function ensureMyAvatar() {
  if (me.avatar && me.avatar.charId === S.charId && me.avatar.label === S.nickname) return;
  disposeAvatar(me.avatar);
  me.avatar = createAvatar(S.charId, S.nickname, true);
  worldRoot.add(me.avatar.root);
}

function resetMe(x, row, maxRow, reachedAt) {
  me.row = row;
  me.dispRow = row;
  me.x = x;
  me.maxRow = maxRow;
  me.reachedAt = reachedAt || 0;
  me.alive = true;
  me.active = false;
  me.log = null;
  me.hop = null;
  me.queued = null;
  me.cause = "";
  me.survivalMs = 0;
  me.face = 0;
  me.faceCur = 0;
  me.pendingDrown = false;
  me.bumpT = 0;
  me.lastMoveAt = 0;
  ensureMyAvatar();
  me.avatar.root.visible = true;
  me.avatar.body.scale.set(1, 1, 1);
  me.avatar.body.material = MAT.solid;
}

function enterMatch(kind, resume) {
  const r = S.room;
  clearLobbyAvatars();
  disposePreview();
  S.mode = "match";
  S.match = {
    round: num(r.round),
    startAt: num(r.startAt),
    endAt: num(r.endAt),
    seed: num(r.mapSeed) >>> 0,
    participant: kind === "play",
    started: false,
    ending: false,
    playingSent: false,
    endSent: false,
    lastCount: -1
  };
  setCourse(S.match.seed);
  clearRemotes();

  if (S.match.participant) {
    if (resume) resetMe(num(resume.x), Math.max(0, num(resume.z)), Math.max(0, num(resume.distance)), num(resume.reachedAt));
    else resetMe(startColumn(), 0, 0, 0);
    S.dirty = false;
    dbUpdate(myPath(), Object.assign(statePayload(), { finished: false }));
    registerPresence();
    startSync();
  } else if (me.avatar) {
    me.avatar.root.visible = false;
  }

  for (const p of S.players.values()) {
    if (p.uid !== S.uid) syncRemote(p, null);
  }

  hideBanner();
  showScreen("match");
  if (!S.match.participant) {
    showBanner("관전 중", "이미 경기가 시작되어 이번 경기는 관전합니다. 다음 경기에 참가할 수 있어요.", 4000);
  }
}

function startSync() {
  stopSync();
  if (S.practice) return;
  S.syncTimer = setInterval(() => {
    if (!S.dirty || !S.match || !S.match.participant || S.match.ending) return;
    S.dirty = false;
    dbUpdate(myPath(), {
      x: round2(me.x),
      z: me.row,
      distance: me.maxRow,
      reachedAt: me.reachedAt,
      updatedAt: serverTimestamp()
    });
  }, GAME.SYNC_INTERVAL_MS);
}

function stopSync() {
  clearInterval(S.syncTimer);
  S.syncTimer = 0;
}

function elapsedMs() {
  return S.match ? serverNow() - S.match.startAt : 0;
}

function obstacleTime() {
  if (S.match && (S.mode === "match" || S.mode === "result")) return elapsedMs() / 1000;
  return performance.now() / 1000;
}

/* ---------- 입력 → 이동 ---------- */
function tryMove(dir) {
  if (S.mode !== "match" || !me.active || !me.alive) return;
  const nowP = performance.now();
  if (me.hop || nowP - me.lastMoveAt < GAME.MOVE_COOLDOWN_MS) {
    me.queued = dir; // 입력 1개만 예약 → 연타해도 비정상적으로 빨라지지 않음
    return;
  }
  doMove(dir);
}

function bump(dir) {
  me.face = FACE[dir];
  me.bumpT = 0.15;
}

function doMove(dir) {
  me.queued = null;
  const nowP = performance.now();
  const t = obstacleTime();
  const cur = course.get(me.row);
  let toRow = me.row;
  let toX = me.x;
  let onLog = false;
  let offFrom = 0;
  let offTo = 0;

  if (dir === "left" || dir === "right") {
    const dx = dir === "right" ? 1 : -1;
    if (me.log) {
      const half = (cur.len - 1) / 2;
      const no = me.log.offset + dx;
      if (Math.abs(no) <= half + 0.01) {
        onLog = true;
        offFrom = me.log.offset;
        offTo = no;
        me.log = { k: me.log.k, offset: no };
      } else {
        toX = me.x + dx;
        me.log = null;
        me.pendingDrown = true;
      }
    } else {
      const col = Math.round(me.x) + dx;
      if (Math.abs(col) > GAME.COLS_HALF || isBlocked(cur, col)) { bump(dir); return; }
      toX = col;
    }
  } else {
    toRow = me.row + (dir === "up" ? 1 : -1);
    if (toRow < 0 || toRow < me.maxRow - GAME.BACK_LIMIT) { bump(dir); return; }
    const col = clamp(Math.round(me.x), -GAME.COLS_HALF, GAME.COLS_HALF);
    if (isBlocked(course.get(toRow), col)) { bump(dir); return; }
    toX = col;
    me.log = null;
  }

  me.face = FACE[dir];
  me.hop = { t0: nowP, fromX: me.x, toX, fromRow: me.row, toRow, onLog, offFrom, offTo };
  me.row = toRow;
  me.lastMoveAt = nowP;
  if (toRow > me.maxRow) {
    me.maxRow = toRow;
    me.reachedAt = Math.round(clamp(elapsedMs(), 0, GAME.MATCH_MS));
  }
  S.dirty = true;
  void t;
}

function landMe(t) {
  const def = course.get(me.row);
  if (def.type === "river") {
    if (me.pendingDrown) {
      me.pendingDrown = false;
      killMe("water");
      return;
    }
    if (me.log) return; // 통나무 위에서 옆으로 이동한 경우
    const f = findLog(def, me.x, t);
    if (!f) {
      killMe("water");
      return;
    }
    const half = (def.len - 1) / 2;
    const off = clamp(Math.round(me.x - f.x + half) - half, -half, half);
    me.log = { k: f.k, offset: off };
    me.x = f.x + off;
  } else {
    me.pendingDrown = false;
    me.log = null;
    me.x = Math.round(me.x);
  }
  S.dirty = true;
}

// 재접속으로 경기 중간에 복귀했을 때 현재 줄 상태 확인
function settleOnRow() {
  const def = course.get(me.row);
  if (def.type === "river") {
    const f = findLog(def, me.x, obstacleTime());
    if (!f) { killMe("water"); return; }
    const half = (def.len - 1) / 2;
    const off = clamp(Math.round(me.x - f.x + half) - half, -half, half);
    me.log = { k: f.k, offset: off };
  } else {
    me.x = clamp(Math.round(me.x), -GAME.COLS_HALF, GAME.COLS_HALF);
  }
}

function killMe(cause) {
  if (!me.alive) return;
  me.alive = false;
  me.active = false;
  me.cause = cause;
  me.hop = null;
  me.queued = null;
  me.log = null;
  me.survivalMs = Math.round(clamp(elapsedMs(), 0, GAME.MATCH_MS));
  me.deadAt = performance.now();
  me.deadRow = me.dispRow;
  me.deathStyle = cause === "water" || cause === "edge" ? "sink" : "flat";
  if (me.avatar) deathFx(me.avatar.root.position, cause);
  S.shake = 0.35;
  if (S.match && S.match.participant && !S.practice) {
    dbUpdate(myPath(), statePayload());
  }
  showBanner("탈락!", `${CAUSE_TEXT[cause] || ""} · 다른 참가자를 관전합니다.`, 2800);
}

function turnToward(a, b, k) {
  const d = mod(b - a + Math.PI, Math.PI * 2) - Math.PI;
  return a + d * k;
}

function updateMe(dt, nowP, t) {
  const m = S.match;
  const av = me.avatar;
  if (!av) return;
  if (!m || !m.participant) { av.root.visible = false; return; }
  av.root.visible = true;
  const live = S.mode === "match" && !m.ending;
  let def = course.get(me.row);
  let y = groundY(def);
  let dispRow = me.row;

  if (me.alive) {
    if (me.hop && live) {
      const h = me.hop;
      const k = clamp((nowP - h.t0) / GAME.HOP_MS, 0, 1);
      const e = easeOut(k);
      if (h.onLog && me.log) me.x = laneX(def, me.log.k, t) + lerp(h.offFrom, h.offTo, e);
      else me.x = lerp(h.fromX, h.toX, e);
      dispRow = lerp(h.fromRow, h.toRow, e);
      y = lerp(groundY(course.get(h.fromRow)), groundY(def), e) + Math.sin(k * Math.PI) * 0.42;
      const st = Math.sin(k * Math.PI);
      av.body.scale.set(1 - st * 0.08, 1 + st * 0.16, 1 - st * 0.08);
      if (k >= 1) {
        me.hop = null;
        landMe(t);
        def = course.get(me.row);
      }
    } else {
      if (me.log && live) {
        me.x = laneX(def, me.log.k, t) + me.log.offset;
        if (Math.abs(me.x) > GAME.COLS_HALF + 0.55) killMe("edge");
      }
      const b = 1 + Math.sin(nowP / 170) * 0.025;
      av.body.scale.set(1, b, 1);
    }
    if (live && me.alive && me.active) {
      const hz = hazardAt(def, me.x, t);
      if (hz && (!me.hop || nowP - me.hop.t0 > GAME.HOP_MS * 0.35)) killMe(hz);
      else if (!me.hop && me.queued && nowP - me.lastMoveAt >= GAME.MOVE_COOLDOWN_MS) doMove(me.queued);
    }
  }

  if (!me.alive) {
    dispRow = me.deadRow;
    const since = (nowP - me.deadAt) / 1000;
    y = groundY(course.get(Math.round(dispRow)));
    if (me.deathStyle === "sink") {
      y -= Math.min(1.4, since * 1.6);
      av.body.scale.set(1, 1, 1);
    } else {
      av.body.scale.set(1.35, 0.2, 1.35);
    }
    if (av.sprite) av.sprite.material.opacity = 0.5;
  } else if (av.sprite) {
    av.sprite.material.opacity = 1;
  }

  me.dispRow = dispRow;
  let bx = 0;
  if (me.bumpT > 0) {
    me.bumpT = Math.max(0, me.bumpT - dt);
    bx = Math.sin(me.bumpT * 60) * 0.05;
  }
  av.root.position.set(me.x + bx, y, -dispRow);
  me.faceCur = turnToward(me.faceCur, me.face, 1 - Math.exp(-dt * 18));
  av.body.rotation.y = me.faceCur;
}

/* ---------- 다른 참가자 (보간 이동) ---------- */
function faceFor(dx, dz, prev) {
  if (Math.abs(dz) >= Math.abs(dx) && dz !== 0) return dz > 0 ? FACE.up : FACE.down;
  if (dx !== 0) return dx > 0 ? FACE.right : FACE.left;
  return prev;
}

function applyRemoteLook(r) {
  const ghost = !r.alive || !r.online;
  r.body.material = ghost ? MAT.ghost : MAT.solid;
  if (r.sprite) r.sprite.material.opacity = ghost ? 0.5 : 1;
}

function syncRemote(p, prev) {
  const m = S.match;
  if (!m || p.uid === S.uid) return;
  if (p.round !== m.round) { removeRemote(p.uid); return; }
  let r = remotes.get(p.uid);
  const nx = clamp(num(p.x), -20, 20);
  const nz = Math.max(0, num(p.z));
  if (!r) {
    const av = createAvatar(p.pokemon, cleanNickname(p.nickname) || "참가자", false);
    worldRoot.add(av.root);
    r = Object.assign(av, {
      uid: p.uid, nickname: cleanNickname(p.nickname) || "참가자",
      x: nx, row: nz, tx: nx, trow: nz, face: 0, faceCur: 0, hopT: 0,
      alive: p.alive !== false, online: p.online !== false
    });
    remotes.set(p.uid, r);
    applyRemoteLook(r);
  }
  if (nx !== r.tx || nz !== r.trow) {
    r.face = faceFor(nx - r.tx, nz - r.trow, r.face);
    r.hopT = 1;
    r.tx = nx;
    r.trow = nz;
  }
  const alive = p.alive !== false;
  const online = p.online !== false;
  if (r.alive && !alive && m.started) deathFx(r.root.position, p.cause);
  r.alive = alive;
  r.online = online;
  applyRemoteLook(r);
  void prev;
}

function removeRemote(uid) {
  const r = remotes.get(uid);
  if (!r) return;
  disposeAvatar(r);
  remotes.delete(uid);
}

function clearRemotes() {
  for (const r of remotes.values()) disposeAvatar(r);
  remotes.clear();
}

function updateRemotes(dt) {
  if (!remotes.size) return;
  const k = 1 - Math.exp(-dt * 10);
  for (const r of remotes.values()) {
    if (Math.abs(r.trow - r.row) > 6 || Math.abs(r.tx - r.x) > 8) {
      r.row = r.trow;
      r.x = r.tx;
    }
    r.x += (r.tx - r.x) * k;
    r.row += (r.trow - r.row) * k;
    r.hopT = Math.max(0, r.hopT - dt * 4);
    const def = course.get(Math.max(0, Math.round(r.row)));
    let y = groundY(def) + Math.sin(r.hopT * Math.PI) * 0.35;
    if (!r.alive) {
      r.body.scale.set(1.3, 0.25, 1.3);
      y = groundY(def);
    } else {
      r.body.scale.set(1, 1, 1);
    }
    r.root.position.set(r.x, y, -r.row);
    r.faceCur = turnToward(r.faceCur, r.face, 1 - Math.exp(-dt * 14));
    r.body.rotation.y = r.faceCur;
  }
}

/* ---------- 경기 시계 · 종료 판정 ---------- */
function noOneAlive() {
  const m = S.match;
  if (m.participant && me.alive) return false;
  for (const p of S.players.values()) {
    if (p.uid === S.uid || p.round !== m.round) continue;
    if (p.alive !== false && p.online !== false) return false;
  }
  return true;
}

function updateMatch() {
  const m = S.match;
  if (!m || S.mode !== "match") return;
  const now = serverNow();
  if (!m.started) {
    const left = m.startAt - now;
    if (left > 0) {
      const n = Math.ceil(left / 1000);
      if (n !== m.lastCount) {
        m.lastCount = n;
        $("countdown-num").textContent = String(n);
        $("countdown").classList.toggle("final", n <= 3);
        show("countdown", true);
      }
    } else {
      m.started = true;
      show("countdown", false);
      if (m.participant && me.alive) {
        me.active = true;
        if (me.row > 0) settleOnRow();
        showBanner("출발!", "", 900);
      }
      if ((isHost() || S.isAdmin) && !S.practice && !m.playingSent) {
        m.playingSent = true;
        dbUpdate(roomPath(), { status: "playing" });
      }
    }
  }
  if (m.started && !m.ending) {
    if (now >= m.endAt) finishMatch("time");
    else if (now > m.startAt + 1500 && noOneAlive()) finishMatch("allout");
  }
}

function finishMatch(reason) {
  const m = S.match;
  if (!m || m.ending) return;
  m.ending = true;
  me.active = false;
  me.queued = null;
  stopSync();
  if (m.participant) {
    if (me.alive) me.survivalMs = reason === "time" ? GAME.MATCH_MS : Math.round(clamp(elapsedMs(), 0, GAME.MATCH_MS));
    if (!S.practice) dbUpdate(myPath(), Object.assign(statePayload(), { finished: true }));
  }
  if ((isHost() || S.isAdmin) && !S.practice && !m.endSent) {
    m.endSent = true;
    dbUpdate(roomPath(), { status: "ended" });
  }
  show("controls", false);
  show("countdown", false);
  showBanner(reason === "time" ? "시간 종료!" : "경기 종료!", "결과를 집계하고 있어요…");
  setTimeout(showResults, S.practice ? 900 : GAME.RESULT_GRACE_MS);
}

/* ---------- 순위 계산 ---------- */
// 순위 기준: 1) 이동 거리 많은 순  2) 생존 시간 긴 순  3) 최고 거리에 먼저 도달한 순  4) 먼저 입장한 순
function compareStanding(a, b) {
  return (b.distance - a.distance)
    || (b.survivalMs - a.survivalMs)
    || (a.reachedAt - b.reachedAt)
    || (a.joinedAt - b.joinedAt)
    || a.uid.localeCompare(b.uid);
}

function buildStandings(final) {
  const m = S.match;
  const list = [];
  if (!m) return list;
  const el = clamp(serverNow() - m.startAt, 0, GAME.MATCH_MS);
  if (m.participant) {
    const mine = S.players.get(S.uid);
    list.push({
      uid: S.uid || "local", nickname: S.nickname, distance: me.maxRow,
      alive: me.alive, disconnected: false,
      survivalMs: me.alive ? (final ? (me.survivalMs || el) : el) : me.survivalMs,
      reachedAt: me.reachedAt, cause: me.cause,
      joinedAt: mine ? num(mine.joinedAt) : 0, me: true
    });
  }
  for (const p of S.players.values()) {
    if (p.uid === S.uid || p.round !== m.round) continue;
    const alive = p.alive !== false;
    const online = p.online !== false;
    let surv;
    if (!alive) surv = num(p.survivalMs);
    else if (!online) surv = clamp(num(p.updatedAt) - m.startAt, 0, GAME.MATCH_MS);
    else surv = final && p.finished ? num(p.survivalMs) : el;
    list.push({
      uid: p.uid, nickname: cleanNickname(p.nickname) || "참가자",
      distance: Math.max(0, num(p.distance)),
      alive: alive && online, disconnected: alive && !online,
      survivalMs: surv, reachedAt: num(p.reachedAt), cause: p.cause || "",
      joinedAt: num(p.joinedAt), me: false
    });
  }
  list.sort(compareStanding);
  list.forEach((e, i) => { e.rank = i + 1; });
  return list;
}

function outcomeText(e) {
  if (e.alive) return "생존";
  if (e.disconnected) return "연결 끊김";
  return RESULT_TEXT[e.cause] || "탈락";
}

function showResults() {
  const m = S.match;
  if (!m || S.mode !== "match") return;
  const list = buildStandings(true);
  S.mode = "result";
  hideBanner();

  // 결과 화면에 도달하면 참가자 실시간 구독 중단 (방 상태 구독만 유지)
  detach(S.unsubPlayers);
  saveHistory(m, list);

  const mine = list.find((e) => e.me);
  const badge = $("result-rank");
  if (mine) {
    badge.textContent = String(mine.rank);
    badge.dataset.rank = String(mine.rank);
    $("result-name").textContent = mine.nickname;
    $("result-outcome").textContent = `${list.length}명 중 ${mine.rank}위 · ${outcomeText(mine)}`;
    $("result-distance").textContent = `${mine.distance}칸`;
    $("result-survival").textContent = formatSec(mine.survivalMs);
  } else {
    badge.textContent = "-";
    badge.dataset.rank = "";
    $("result-name").textContent = S.nickname;
    $("result-outcome").textContent = "이번 경기는 관전했습니다.";
    $("result-distance").textContent = "-";
    $("result-survival").textContent = "-";
  }

  const tbody = $("result-table-body");
  tbody.textContent = "";
  for (const e of list) {
    const tr = document.createElement("tr");
    if (e.me) tr.className = "is-me";
    for (const v of [String(e.rank), e.nickname, `${e.distance}칸`, formatSec(e.survivalMs), outcomeText(e)]) {
      const td = document.createElement("td");
      td.textContent = v;
      tr.append(td);
    }
    tbody.append(tr);
  }
  if (!list.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "기록이 없습니다.";
    tr.append(td);
    tbody.append(tr);
  }

  show("reward-box", !S.practice);
  $("result-disclaimer").textContent = S.practice
    ? "연습 모드 기록은 이벤트 결과에 포함되지 않습니다."
    : "이 기록은 각 참가자의 브라우저에서 계산된 참고용 기록입니다. 공식 순위와 보상은 관리자가 확인한 뒤 확정합니다.";
  $("btn-back-lobby").textContent = S.practice ? "다시 하기" : "대기실로 돌아가기";
  show("next-match", false);
  showScreen("result");
}

function returnToLobby() {
  if (S.practice) { startPractice(); return; }
  stopSync();
  clearRemotes();
  if (me.avatar) me.avatar.root.visible = false;
  S.match = null;
  S.mode = "lobby";
  setCourse(DEMO_SEED);
  attachPlayerListeners();
  registerPresence();
  if ((isHost() || S.isAdmin) && S.room.status === "ended") dbUpdate(roomPath(), { status: "lobby" });
  S.lobbyDirty = true;
  showScreen("lobby");
  scheduleRoomApply();
}

async function leaveRoom({ keepNode = false, message = "" } = {}) {
  S.leaving = true;
  forgetActiveRoom();
  stopSync();
  const m = S.match;
  detach(S.unsubPlayers);
  detach(S.unsubRoom);
  if (!S.practice && db && S.inRoom) {
    try {
      await withTimeout(onDisconnect(ref(db, myPath())).cancel(), 1500);
    } catch (e) { /* 무시 */ }
    if (!keepNode) {
      let p;
      if (m && m.participant && S.mode === "match" && !m.ending && me.alive) {
        me.alive = false;
        me.cause = "left";
        me.survivalMs = Math.round(clamp(elapsedMs(), 0, GAME.MATCH_MS));
        p = update(ref(db, myPath()), Object.assign(statePayload(), { online: false }));
      } else if (m && m.participant && (S.mode === "match" || S.mode === "result")) {
        p = update(ref(db, myPath()), { online: false, cause: "left", updatedAt: serverTimestamp() });
      } else {
        p = remove(ref(db, myPath()));
      }
      try { await withTimeout(p, 2000); } catch (e) { /* 무시 */ }
    }
    detach(S.unsubInfo);
    goOffline(db);
  }
  S.inRoom = false;
  S.practice = false;
  S.match = null;
  S.players.clear();
  S.netDown = false;
  S.everConnected = false;
  S.room = { hostId: null, status: null, startAt: 0, endAt: 0, mapSeed: 0, round: 0 };
  show("net-banner", false);
  clearRemotes();
  clearLobbyAvatars();
  if (me.avatar) me.avatar.root.visible = false;
  hideBanner();
  S.mode = "menu";
  setCourse(DEMO_SEED);
  showScreen("menu");
  menuError(message);
  loadHistory();
  S.leaving = false;
}

/* ---------- 혼자 연습하기 (Firebase 없이 동작) ---------- */
function startPractice() {
  if (S.inRoom && !S.practice) return;
  stopSync();
  clearRemotes();
  S.practice = true;
  S.inRoom = true;
  S.uid = "local";
  S.serverOffset = 0;
  S.nickname = cleanNickname($("input-nickname").value) || "트레이너";
  store("pca.char", S.charId);
  const now = Date.now();
  const round = num(S.room.round) + 1;
  S.room = {
    hostId: "local", status: "countdown", round,
    mapSeed: Math.floor(Math.random() * 2147483647),
    startAt: now + GAME.PRACTICE_COUNTDOWN_MS,
    endAt: now + GAME.PRACTICE_COUNTDOWN_MS + GAME.MATCH_MS
  };
  S.players.clear();
  enterMatch("play", null);
}

/* ==========================================================================
   12. 화면(UI)
   ========================================================================== */
function menuError(msg) {
  $("menu-error").textContent = msg || "";
}

function setJoinBusy(on) {
  const b = $("btn-join");
  b.disabled = on || !FIREBASE_READY;
  b.textContent = on ? "입장 중…" : "대기실 입장";
  $("btn-practice").disabled = on;
}

function showScreen(name) {
  document.body.dataset.mode = name;
  show("screen-menu", name === "menu");
  show("screen-lobby", name === "lobby");
  show("screen-result", name === "result");
  const inMatch = name === "match";
  show("hud", inMatch);
  show("leaderboard", inMatch);
  show("controls", inMatch && IS_TOUCH && Boolean(S.match && S.match.participant));
  if (!inMatch) {
    show("countdown", false);
    show("spectate-tag", false);
    document.body.classList.remove("board-open");
  }
  if (name === "menu") refreshPreview();
  else disposePreview();
  if (name === "lobby") S.lobbyDirty = true;
  requestAnimationFrame(resize);
}

function renderCharGrid() {
  const grid = $("char-grid");
  grid.textContent = "";
  for (const c of CHARACTERS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "char-card";
    b.dataset.id = c.id;
    b.style.setProperty("--c", c.color);
    const sw = document.createElement("span");
    sw.className = "char-swatch";
    const nm = document.createElement("span");
    nm.className = "char-name";
    nm.textContent = c.name;
    b.append(sw, nm);
    b.addEventListener("click", () => selectChar(c.id));
    grid.append(b);
  }
}

function selectChar(id) {
  if (!CHAR_BY_ID[id]) return;
  S.charId = id;
  store("pca.char", id);
  for (const b of $("char-grid").children) b.setAttribute("aria-pressed", String(b.dataset.id === id));
  refreshPreview();
}

function refreshPreview() {
  disposePreview();
  if (S.mode !== "menu") return;
  preview = createAvatar(S.charId, null, false);
  preview.pop = 1;
  worldRoot.add(preview.root);
}

function disposePreview() {
  if (preview) disposeAvatar(preview);
  preview = null;
}

function animatePreview(t, dt) {
  if (!preview) return;
  preview.pop = Math.max(0, preview.pop - dt * 3);
  const hop = Math.max(0, Math.sin(t * 2.4));
  preview.root.position.set(0, hop * hop * 0.25 + Math.sin(preview.pop * Math.PI) * 0.4, 0);
  preview.root.rotation.y = Math.PI + Math.sin(t * 0.7) * 0.6;
  const sq = 1 + Math.sin(t * 4.8) * 0.03;
  preview.body.scale.set(1 / sq, sq, 1 / sq);
}

/* ---------- 대기실 ---------- */
function renderLobby() {
  $("lobby-room").textContent = S.roomId;
  const list = lobbyPlayers();
  const runners = list.filter((p) => p.spectator !== true);
  const ready = runners.filter((p) => p.online !== false);
  const away = runners.length - ready.length;
  $("lobby-count").textContent = `${runners.length} / ${GAME.MAX_PLAYERS}`;
  const ul = $("lobby-list");
  ul.textContent = "";
  for (const p of list) {
    const li = document.createElement("li");
    const isAway = p.online === false;
    li.className = `${p.uid === S.uid ? "is-me" : ""}${isAway ? " is-away" : ""}`.trim();
    const c = CHAR_BY_ID[p.pokemon] || CHARACTERS[0];
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.setProperty("--c", c.color);
    const name = document.createElement("span");
    name.className = "p-name";
    name.textContent = cleanNickname(p.nickname) || "참가자";
    const ch = document.createElement("span");
    ch.className = "p-char";
    ch.textContent = p.spectator === true ? "진행" : c.name;
    li.append(dot, name, ch);
    if (isAway) {
      const b = document.createElement("span");
      b.className = "badge badge-away";
      b.textContent = "자리 비움";
      li.append(b);
    }
    // admin 표시는 보안 규칙이 admins 등록 여부를 검증한 값이라 위조할 수 없음
    if (p.admin === true) {
      const b = document.createElement("span");
      b.className = "badge badge-host";
      b.textContent = "관리자";
      li.append(b);
    }
    if (p.uid === S.uid) {
      const b = document.createElement("span");
      b.className = "badge badge-me";
      b.textContent = "나";
      li.append(b);
    }
    ul.append(li);
  }

  const active = roomIsActive();
  const enough = ready.length >= GAME.MIN_PLAYERS;
  const adminHere = list.some((p) => p.admin === true && p.online !== false);
  const sec = Math.round(GAME.COUNTDOWN_MS / 1000);
  show("btn-start", S.isAdmin);
  $("btn-start").disabled = !enough || active;
  let hint;
  if (active) hint = "이전 경기가 정리되는 중입니다. 잠시만 기다려 주세요.";
  else if (S.isAdmin) hint = enough
    ? `모두 모이면 경기 시작을 눌러 주세요. ${sec}초 카운트다운 후 출발합니다.`
    : `접속 중인 참가자가 ${GAME.MIN_PLAYERS}명 이상이어야 경기를 시작할 수 있어요.`;
  else if (adminHere) hint = `관리자가 경기를 시작하면 ${sec}초 카운트다운 후 자동으로 출발합니다. 시작 전에는 게임 화면을 켜 두세요.`;
  else hint = "아직 관리자가 대기실에 없습니다. 관리자가 입장해 경기를 시작할 때까지 기다려 주세요.";
  if (away > 0) hint += ` (자리 비움 ${away}명은 게임 화면으로 돌아와야 경기에 참가합니다)`;
  $("lobby-hint").textContent = hint;
  updateLobbyScene(runners);
}

function updateLobbyScene(list) {
  const seen = new Set();
  list.forEach((p, i) => {
    seen.add(p.uid);
    const label = cleanNickname(p.nickname) || "참가자";
    let a = lobbyAvatars.get(p.uid);
    if (a && (a.charId !== p.pokemon || a.label !== label)) {
      disposeAvatar(a);
      lobbyAvatars.delete(p.uid);
      a = null;
    }
    if (!a) {
      a = createAvatar(p.pokemon, label, p.uid === S.uid);
      a.phase = Math.random() * 10;
      worldRoot.add(a.root);
      lobbyAvatars.set(p.uid, a);
    }
    a.home = { x: ((i % 10) - 4.5) * 1.1, row: i < 10 ? 1 : 0 };
  });
  for (const [id, a] of lobbyAvatars) {
    if (!seen.has(id)) {
      disposeAvatar(a);
      lobbyAvatars.delete(id);
    }
  }
}

function animateLobby(t) {
  for (const a of lobbyAvatars.values()) {
    if (!a.home) continue;
    const s = Math.max(0, Math.sin(t * 3 + a.phase));
    a.root.position.set(a.home.x, s * s * 0.3, -a.home.row);
    a.body.rotation.y = Math.PI;
  }
}

function clearLobbyAvatars() {
  for (const a of lobbyAvatars.values()) disposeAvatar(a);
  lobbyAvatars.clear();
}

/* ---------- 경기 HUD / 순위표 ---------- */
let boardTick = 0;
function renderHud() {
  const m = S.match;
  const now = serverNow();
  const list = buildStandings(false);
  const myIdx = list.findIndex((e) => e.me);
  $("hud-distance").textContent = m.participant ? String(me.maxRow) : "-";
  $("hud-time").textContent = m.started ? formatClock(m.endAt - now) : formatClock(GAME.MATCH_MS);
  $("hud-rank").textContent = myIdx >= 0 ? `${myIdx + 1}/${list.length}` : "-";
  $("hud-alive").textContent = String(list.filter((e) => e.alive).length);

  const spectating = !m.participant || (!me.alive && performance.now() - me.deadAt > 1800);
  if (spectating && m.started) {
    const f = spectateTarget();
    $("spectate-tag").textContent = f ? `관전 중 · ${f.nickname}` : "관전 중";
    show("spectate-tag", true);
  } else {
    show("spectate-tag", false);
  }
  show("controls", IS_TOUCH && m.participant && me.alive && !m.ending);

  boardTick = (boardTick + 1) % 2;
  if (boardTick) return;
  const ol = $("board-list");
  ol.textContent = "";
  const shown = list.slice(0, 8);
  if (myIdx >= 8) shown.push(list[myIdx]);
  for (const e of shown) {
    const li = document.createElement("li");
    li.className = `board-row${e.me ? " is-me" : ""}${e.alive || !m.started ? "" : " is-out"}`;
    const rk = document.createElement("span");
    rk.className = "board-rank";
    rk.textContent = String(e.rank);
    const nm = document.createElement("span");
    nm.className = "board-name";
    nm.textContent = e.nickname;
    const ds = document.createElement("span");
    ds.className = "board-dist";
    ds.textContent = String(e.distance);
    li.append(rk, nm, ds);
    ol.append(li);
  }
}

function updateNextMatchBanner() {
  const m = S.match;
  const r = S.room;
  const on = !S.practice && m && r.status === "countdown" && num(r.round) > m.round && serverNow() < num(r.startAt) - 1000;
  show("next-match", Boolean(on));
}

function setupAdminContact() {
  const url = String(ADMIN_CONTACT_URL || "").trim();
  let valid = false;
  try {
    const u = new URL(url);
    valid = u.protocol === "https:" || u.protocol === "http:";
  } catch (e) {
    valid = false;
  }
  const btn = $("btn-contact");
  show("btn-contact", valid);
  $("contact-note").textContent = valid
    ? "버튼을 누르면 관리자가 지정한 페이지가 새 창으로 열립니다. 문의는 해당 페이지에서 직접 남겨 주세요."
    : "관리자 문의 링크가 아직 설정되지 않았습니다. 디스코드 서버의 공지 채널을 확인해 주세요.";
  btn.onclick = () => {
    if (valid) window.open(url, "_blank", "noopener,noreferrer");
  };
}

/* ==========================================================================
   13. 카메라 · 렌더링 루프
   ========================================================================== */
const camFocus = new THREE.Vector3();
const camLook = new THREE.Vector3();
let stageW = 1;
let stageH = 1;

function applyViewOffset() {
  if (S.mode === "menu" || S.mode === "lobby") {
    if (stageW >= 900) camera.setViewOffset(stageW, stageH, Math.round(Math.min(230, stageW * 0.18)), 0, stageW, stageH);
    else camera.setViewOffset(stageW, stageH, 0, Math.round(stageH * 0.24), stageW, stageH);
  } else {
    camera.clearViewOffset();
  }
}

function resize() {
  stageW = Math.max(1, stage.clientWidth || window.innerWidth);
  stageH = Math.max(1, stage.clientHeight || window.innerHeight);
  renderer.setSize(stageW, stageH, false);
  camera.aspect = stageW / stageH;
  camera.fov = camera.aspect < 0.8 ? 52 : 42;
  applyViewOffset();
  camera.updateProjectionMatrix();
}

function spectateTarget() {
  let best = null;
  for (const r of remotes.values()) {
    if (r.alive && r.online && (!best || r.trow > best.trow)) best = r;
  }
  return best;
}

function matchFocus() {
  const m = S.match;
  if (m && m.participant && (me.alive || performance.now() - me.deadAt < 1800)) return { x: me.x, row: me.dispRow };
  const best = spectateTarget();
  if (best) return { x: best.x, row: best.row };
  return { x: me.x, row: me.dispRow || 0 };
}

function updateCamera(dt, tSec) {
  const portrait = camera.aspect < 0.8;
  const k = 1 - Math.exp(-dt * 6);
  if (S.mode === "menu") {
    const a = Math.sin(tSec * 0.25) * 0.35;
    camera.position.set(Math.sin(a) * 4.6 + 1.2, 2.3, Math.cos(a) * 4.6);
    camLook.set(0, 0.6, -0.4);
    camera.lookAt(camLook);
    camFocus.set(0, 0, 0);
  } else {
    let fx = 0;
    let fz = -1.5;
    let off;
    let ahead = 0;
    if (S.mode === "lobby") {
      off = portrait ? [1.5, 9.5, 9] : [2.5, 7, 8];
    } else {
      const f = matchFocus();
      fx = clamp(f.x, -3.5, 3.5);
      fz = -f.row;
      off = portrait ? [1.6, 13, 8.6] : [2.6, 10.5, 7.4];
      ahead = -1.4;
    }
    camFocus.x += (fx - camFocus.x) * k;
    camFocus.z += (fz - camFocus.z) * k;
    let sx = 0;
    let sy = 0;
    if (S.shake > 0) {
      S.shake = Math.max(0, S.shake - dt);
      sx = (Math.random() - 0.5) * S.shake * 0.8;
      sy = (Math.random() - 0.5) * S.shake * 0.8;
    }
    camera.position.set(camFocus.x + off[0] + sx, off[1] + sy, camFocus.z + off[2]);
    camLook.set(camFocus.x, 0, camFocus.z + ahead);
    camera.lookAt(camLook);
  }
  sun.position.set(camFocus.x - 5, 14, camFocus.z + 7);
  sun.target.position.set(camFocus.x, 0, camFocus.z - 2);
}

let lastP = performance.now();
let lastUi = 0;

function frame() {
  requestAnimationFrame(frame);
  const nowP = performance.now();
  const dt = Math.min(0.05, (nowP - lastP) / 1000);
  lastP = nowP;
  const t = obstacleTime();

  if (S.mode === "match") updateMatch();
  if (S.match && (S.mode === "match" || S.mode === "result")) updateMe(dt, nowP, t);
  updateRemotes(dt);
  if (S.mode === "lobby") animateLobby(nowP / 1000);
  if (S.mode === "menu") animatePreview(nowP / 1000, dt);

  const focusRow = S.match && (S.mode === "match" || S.mode === "result") ? matchFocus().row : 0;
  syncRowViews(focusRow);
  updateMovers(t);
  updateParticles(dt);
  updateCamera(dt, nowP / 1000);

  if (nowP - lastUi > 250) {
    lastUi = nowP;
    if (S.mode === "lobby" && S.lobbyDirty) {
      S.lobbyDirty = false;
      renderLobby();
    }
    if (S.mode === "match" && S.match) renderHud();
    if (S.mode === "result") updateNextMatchBanner();
  }
  renderer.render(scene, camera);
}

/* ==========================================================================
   14. 입력 (키보드 · 스와이프 · 방향 버튼)
   ========================================================================== */
const KEYMAP = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right"
};

function bindInput() {
  window.addEventListener("keydown", (e) => {
    if (S.mode !== "match") return;
    const tag = e.target && e.target.tagName ? e.target.tagName : "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const dir = KEYMAP[e.code];
    if (!dir) return;
    e.preventDefault();
    if (e.repeat) return; // 키를 누르고 있어도 한 칸만 이동
    tryMove(dir);
  });

  let touchStart = null;
  stage.addEventListener("touchstart", (e) => {
    if (S.mode !== "match") return;
    const tt = e.changedTouches[0];
    touchStart = { x: tt.clientX, y: tt.clientY };
    e.preventDefault();
  }, { passive: false });
  stage.addEventListener("touchmove", (e) => {
    if (S.mode === "match") e.preventDefault();
  }, { passive: false });
  stage.addEventListener("touchend", (e) => {
    if (S.mode !== "match" || !touchStart) return;
    const tt = e.changedTouches[0];
    const dx = tt.clientX - touchStart.x;
    const dy = tt.clientY - touchStart.y;
    touchStart = null;
    const ad = Math.max(Math.abs(dx), Math.abs(dy));
    if (ad < 22) tryMove("up");
    else if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? "right" : "left");
    else tryMove(dy < 0 ? "up" : "down");
    e.preventDefault();
  }, { passive: false });

  for (const btn of document.querySelectorAll(".dpad")) {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.classList.add("pressed");
      tryMove(btn.dataset.dir);
    });
    const up = () => btn.classList.remove("pressed");
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("pointerleave", up);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  $("controls").addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") onReturnToPage();
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) onReturnToPage();
  });
  window.addEventListener("online", onReturnToPage);
}

function bindButtons() {
  $("btn-join").addEventListener("click", joinRoom);
  $("btn-practice").addEventListener("click", () => {
    if (!S.inRoom) startPractice();
  });
  $("btn-start").addEventListener("click", adminStart);
  $("btn-admin-login").addEventListener("click", adminLogin);
  $("btn-admin-logout").addEventListener("click", adminLogout);
  $("btn-player-logout").addEventListener("click", playerLogout);
  $("input-nickname").addEventListener("input", refreshSessionUi);
  $("input-password").addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoom(); });
  $("input-admin-password").addEventListener("keydown", (e) => { if (e.key === "Enter") adminLogin(); });
  $("btn-leave-lobby").addEventListener("click", () => leaveRoom());
  $("btn-back-lobby").addEventListener("click", returnToLobby);
  $("btn-exit").addEventListener("click", () => leaveRoom());
  $("btn-join-next").addEventListener("click", returnToLobby);
  $("btn-toggle-board").addEventListener("click", () => document.body.classList.toggle("board-open"));
  $("btn-quit").addEventListener("click", () => {
    const ok = !S.match || !S.match.participant || !me.alive || S.practice
      || window.confirm("경기에서 나갈까요? 진행 중인 기록은 '중도 이탈'로 처리됩니다.");
    if (ok) leaveRoom();
  });
  $("input-nickname").addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoom(); });
  $("input-room").addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoom(); });
  $("input-room").addEventListener("input", () => {
    clearTimeout(historyTimer);
    historyTimer = setTimeout(loadHistory, 700);
  });
}

/* ==========================================================================
   15. 시작
   ========================================================================== */
function init() {
  renderCharGrid();
  const params = new URLSearchParams(location.search);
  $("input-nickname").value = cleanNickname(load("pca.nickname", ""));
  const savedChar = load("pca.char", "fox");
  S.charId = CHAR_BY_ID[savedChar] ? savedChar : "fox";
  const qRoom = (params.get("room") || "").toLowerCase();
  const savedRoom = load("pca.room", DEFAULT_ROOM_ID);
  $("input-room").value = /^[a-z0-9-]{1,20}$/.test(qRoom) ? qRoom : (/^[a-z0-9-]{1,20}$/.test(savedRoom) ? savedRoom : DEFAULT_ROOM_ID);
  for (const b of $("char-grid").children) b.setAttribute("aria-pressed", String(b.dataset.id === S.charId));

  if (!FIREBASE_READY || !db) {
    show("config-warning", true);
    $("btn-join").disabled = true;
  }
  setupAdminContact();
  bindButtons();
  if (FIREBASE_READY && fbAuth) {
    const stopAuth = onAuthStateChanged(fbAuth, () => {
      stopAuth();
      const player = currentPlayerAccount();
      if (player && player.displayName && !cleanNickname($("input-nickname").value)) $("input-nickname").value = player.displayName;
      refreshSessionUi();
      refreshAdminUi();
      resumeActiveRoom();
    });
  } else {
    show("admin-box", false);
    show("password-field", false);
    show("player-session", false);
  }
  bindInput();
  setCourse(DEMO_SEED);
  showScreen("menu");
  loadHistory();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
  window.__arenaBooted = true;
}

init();
