# Heading Only Fold

Obsidian에서 **헤딩만** 단계별로 접고 펼치는 작은 팝오버 플러그인입니다. 목록의 접힘 상태와 Reading / Live Preview / Source 모드를 유지합니다.

## 기능

- 전체 헤딩 또는 H1~H6의 접기·펼치기를 한 번에 실행
- 우하단 트리 아이콘 옆에 표시되는 작은 팝오버
- 실행 후에도 패널 유지, 배경 음영 없음
- H1~H6 버튼이 현재 헤딩 글자색과 테마 변경을 자동으로 따라감
- 전체 행은 무채색
- 본문이나 접기 주석을 Markdown에 삽입하지 않음

## 설치: BRAT

1. Obsidian 설정 → 커뮤니티 플러그인에서 **BRAT**를 설치하고 활성화합니다.
2. BRAT의 **Add a beta plugin for testing**에서 `JM911/obsidian-heading-only-fold`를 등록합니다.
3. 최신 릴리스를 선택하고 **Heading Only Fold**를 활성화합니다.
4. 이후 업데이트는 BRAT로 확인하고 적용합니다.

## 수동 설치

[최신 릴리스](https://github.com/JM911/obsidian-heading-only-fold/releases/latest)에서 `main.js`, `manifest.json`, `styles.css`를 받아 보관함의 `.obsidian/plugins/heading-only-fold/`에 넣습니다.
Obsidian을 다시 로드하고 커뮤니티 플러그인 목록에서 활성화합니다.

## 사용

오른쪽 아래 트리 아이콘을 누르고 원하는 행의 접기 또는 펼치기 아이콘을 누릅니다.
명령어 팔레트의 **Heading Only Fold: 헤딩 접기 패널 열기**로도 열 수 있습니다.
바깥쪽 클릭, Escape, × 또는 열기 버튼을 다시 누르면 닫힙니다.

- 헤딩을 접으면 그 아래 내용도 숨겨지지만 목록 자체의 접힘 상태는 보존합니다.
- 상위 헤딩이 접혀 있으면 하위 헤딩을 펼쳐도 보이지 않을 수 있습니다.
- 본문이 없는 헤딩은 처리 대상에서 제외될 수 있습니다.
- 편집 직후에는 메타데이터 반영까지 잠시 기다린 뒤 실행하세요.
- Sticky Headings Lite 설치 여부와 무관하게 동작합니다.

## 개발 및 검증

빌드 과정이나 런타임 의존성 없이 Obsidian이 제공하는 API를 사용하는 CommonJS 플러그인입니다.

```sh
node --check main.js
node --test tests/heading-only-fold.test.cjs
```

접기에는 Obsidian 내부 API가 사용되므로 향후 Obsidian 버전에 따라 수정이 필요할 수 있습니다.
데스크톱 Obsidian 1.15.1에서 Reading / Live Preview 동작을 확인했습니다. 모바일 실기기 검증은 수행하지 않았습니다.

릴리스 태그는 `manifest.json`의 버전과 동일하게 사용합니다. 릴리스에 위의 세 파일을 개별 첨부합니다.
`versions.json`은 릴리스 버전별 최소 Obsidian 버전을 기록합니다.

## 라이선스

MIT
