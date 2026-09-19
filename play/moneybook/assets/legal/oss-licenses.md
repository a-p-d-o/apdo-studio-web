# 오픈소스 라이선스 고지 — 허니 가계부

> 확인: `legal-compliance` · 2026-09-12
> 확인 방법: `apps/moneybook/pubspec.yaml`에 직접 적힌 의존성과 `pubspec.lock`의 확정 버전,
> 그리고 각 패키지가 배포와 함께 담고 있는 `LICENSE` 파일을 직접 읽었습니다.

---

## 판정 — **GPL 계열 0건**

앱에 넣으면 위험한 라이선스(GPL·AGPL·LGPL 계열)가 **하나도 없습니다.**
전부 허용형(permissive) 라이선스라 상용·비공개 앱에 넣어도 문제가 없어요.
다만 **저작권 고지 의무**가 있으므로 앱 안이나 문서로 아래 목록을 밝혀야 합니다.

---

## 1. 앱이 직접 쓰는 것

| 구성요소 | 버전 | 라이선스 | 비고 |
|---|---|---|---|
| Flutter · Dart SDK | SDK ^3.13.2 | BSD 3-Clause | Google |
| `cryptography_plus` | 3.0.0 | Apache License 2.0 | AES-256-GCM 암호화 |
| `shared_preferences` | 2.5.5 | BSD 3-Clause | 기기 안 저장 |
| `http` | 1.6.0 | BSD 3-Clause | Dart 공식. **현재 화면에 연결돼 있지 않습니다** — 이 사실은 게이트 G18(`ops/scripts/gates/privacy_promise_gate.py`)이 기계로 지킵니다 |
| `web` | 1.1.1 | BSD 3-Clause | 브라우저 API 바인딩 |
| `cupertino_icons` | 1.0.9 | MIT | 아이콘 글꼴 |
| `apdo_design_tokens` | 로컬 | 자사 코드 | 외부 라이선스 아님 |

## 2. 글꼴

| 글꼴 | 라이선스 | 의무 |
|---|---|---|
| Pretendard (Regular · SemiBold · Bold) | **SIL Open Font License 1.1** | 고지 필요. 글꼴 파일 자체를 판매하지 않는 한 앱 내장 가능. 라이선스 원문이 `assets/fonts/OFL-pretendard.txt`에 함께 들어 있습니다 |
| **Material Icons** (`MaterialIcons-Regular.otf`) | **Apache License 2.0** | 고지 필요. `pubspec.yaml`의 `uses-material-design: true` 때문에 **Flutter가 자동으로 앱에 넣습니다** |
| **CupertinoIcons** (`CupertinoIcons.ttf`) | MIT | 고지 필요. 위 1번 표의 `cupertino_icons` 패키지가 담고 있는 글꼴 파일입니다 |

> 🔴 **2026-09-13 보강.** 그 전까지 이 표에는 **Pretendard 하나만** 적혀 있었습니다.
> 공개 시험판을 브라우저로 열고 실제로 내려받는 파일을 확인해 보니
> `MaterialIcons-Regular.otf`와 `CupertinoIcons.ttf`도 함께 나가고 있었어요.
> **앱에 들어가는데 목록에 없던 글꼴**이라 여기에 더했습니다.
> 둘 다 고지 의무만 있는 허용형이라 「GPL 계열 0건」 판정은 그대로입니다.

> SIL OFL 1.1은 **Reserved Font Name**을 바꿔서 재배포하지 말 것을 요구합니다.
> 저희는 글꼴을 수정하지 않고 그대로 넣으므로 해당되지 않아요.

## 3. 개발 단계에서만 쓰는 것 (앱에 들어가지 않음)

| 구성요소 | 버전 | 라이선스 |
|---|---|---|
| `flutter_test` | SDK | BSD 3-Clause |
| `flutter_lints` | 6.0.0 | BSD 3-Clause |

---

## 4. 아직 안 한 것

- **앱 안에 「오픈소스 라이선스」 화면이 없습니다.** 법적 필수는 아니지만 BSD·MIT·OFL은
  고지 의무가 있어요. Flutter는 `showLicensePage()`로 대부분 자동 수집되므로,
  [설정] 안에 줄 하나를 두는 것으로 끝납니다.
  🔴 다만 **사규 「동작하지 않는 버튼은 그리지 않는다」**에 따라, 화면을 실제로 붙인 뒤에
  이 줄을 지워야 합니다.
- **아이콘·이미지 출처 확인**: `docs/icon-and-store.md` 기록상 아이콘은 손으로 짠 SVG이고
  외부 이미지·유료 에셋·AI 생성이 0건이라고 적혀 있습니다. 파일을 직접 대조하지는 못했습니다.

**최종 수정: 2026년 9월 13일**
