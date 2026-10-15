# 옛한글 지원 업데이트 및 참고 출처

작성일: 2026-10-15

## 업데이트 내용

| 항목 | 추가·수정 사항 |
|---|---|
| 옛한글 전용 MCP 도구 | `read_hwp_old_hangul`: 변환문, 선택적 변환 전 추출문, 문자 수·미지원 코드 진단을 JSON으로 반환 |
| 구형 문자 인코딩 | 한양 PUA 5,660개를 유니코드 결합 자모로 변환. 출력이 빈 U+F86A와 알 수 없는 PUA는 보존 |
| 옛자모·방점 | 아래아·반치음·옛이응·순경음 비읍·확장 자모·채움문자·방점을 보존. 현대화나 유니코드 정규화를 적용하지 않음 |
| 기존 읽기·변환 도구 | `old_hangul: "unicode"` 선택 인자 추가. 생략 시 추출된 문자를 보존하는 `preserve` 모드 |
| HWPX 숫자 참조 | rhwp 0.7.7에서 누락되는 본문의 비 ASCII XML 숫자 참조를 WASM 전달 전에 메모리에서 해석. 원본 파일은 수정하지 않음 |
| 배포·설명 | 사용 안내와 매핑 출처를 포함. 공개 npm에 새 버전을 배포하는 작업은 수행하지 않음 |
| 별도 개발 저장소 | `duomo77/hwp-mcp-old-hangul`에 보관. 로컬 패키지명 `hwp-mcp-old-hangul`, 현재 버전 `0.3.0-old-hangul.2`, `private: true`로 구분하고 기존 원저작자 표시는 유지 |
| 옛한글 수정 검증 | HWPX 생성·추가·검색 치환·템플릿·문단·표 셀의 저장·재열기 검사. 검색 시 PUA/Unicode 동등 비교 선택 인자, 숫자 참조·인접 run·전체 출현 치환 지원. `.hwp` 저장은 미지원 |

## 기반 프로젝트와 참고 자료

| 출처 | 이 변경에서 사용한 범위 | 출처·버전 |
|---|---|---|
| treesoop/hwp-mcp | 기존 MCP 서버, 읽기·표·각주 등의 walker, Markdown 변환 및 테스트 구조를 기반으로 확장 | [저장소](https://github.com/treesoop/hwp-mcp), 기준 커밋 [4a93489d4f7dd316279b5f6f5d83014d9a8063f4](https://github.com/treesoop/hwp-mcp/commit/4a93489d4f7dd316279b5f6f5d83014d9a8063f4), MIT |
| edwardkim/rhwp / @rhwp/core | HWP 5.x·HWPX의 파싱 및 텍스트 접근에 사용하는 기존 Rust/WASM 의존성 | [저장소](https://github.com/edwardkim/rhwp), 실제 검증 버전 `@rhwp/core 0.7.7` |
| KTUG HanyangPuaTableProject | 한양 PUA와 유니코드 자모 사이의 대응 데이터 | [프로젝트](http://faq.ktug.or.kr/mywiki/HanyangPuaTableProject). 원본 표에 Public Domain으로 명시 |
| mete0r/hypua2jamo의 데이터 파일 | KTUG 표를 확보한 고정 버전. 실행 코드를 복사하지 않고 매핑 데이터만 사용 | [hypua2jamocomposed.txt](https://github.com/mete0r/hypua2jamo/blob/cf030e6997529a49d67234e2f611f5b9a0af2b34/data/hypua2jamocomposed.txt), 커밋 `cf030e6997529a49d67234e2f611f5b9a0af2b34` |
| Unicode Consortium | 결합 자모와 채움문자의 표현 방식에 관한 설명 참고 | [Korean FAQ](https://www.unicode.org/faq/korean.html) |

매핑 원본 SHA-256:

```text
118d90e18d53877ea8ee0034936ffcffd8d4fc0e88e8f7a27cd53fff6ff46585
```

원본 5,661행 중 비어 있는 U+F86A 행을 제외한 5,660개만 생성했습니다.
주석에 적힌 과거 값을 데이터에 섞지 않으며, 재생성 시 고정 체크섬·중복 키·매핑 수를 검사합니다.
`src/core/old-hangul.ts`, `src/core/hwpx-unicode.ts`, 매핑 생성 스크립트와 새 테스트는 이번 수정에서 작성했습니다.
기존 프로젝트의 MIT 라이선스와 원저작자 표시는 유지합니다.

## 검증 결과

`npm ci` 후 `npm run build`와 `npm test`가 성공했습니다.
초기 읽기 지원 버전은 테스트 파일 22개, 테스트 98개가 모두 통과했습니다.
수정 기능 보완 버전은 테스트 파일 24개, 테스트 123개가 모두 통과했습니다.
발견한 문제·수정 내역·검증의 한계는 [수정 검증 보고서](OLD_HANGUL_EDIT_VERIFICATION_KO.md)에 기록했습니다.

검사 범위는 HWP/HWPX 본문·표, HWP 머리말·꼬리말·각주, Unicode/PUA 혼합,
HWPX 숫자 참조·분리된 텍스트 run, 미지원 PUA·이모지 보존,
UTF-8 Markdown 저장, MCP 도구 목록 및 실제 호출입니다.

테스트 자료는 합성 문서입니다. 실제 고문헌의 특수 글꼴·컨트롤에 대한 호환성을 보장하는 결과는 아닙니다.
HWP 3.x, 스캔 OCR, 현대어 번역, 표시 글꼴의 셰이핑은 포함하지 않습니다.
PUA의 의미는 글꼴마다 다를 수 있으므로 한양 PUA가 아닌 문서는 `preserve`로 비교해야 합니다.

사용법과 데이터 재생성 절차: [옛한글 지원 안내](old-hangul.md).
