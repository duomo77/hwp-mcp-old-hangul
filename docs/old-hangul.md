# 옛한글 텍스트 추출

이 기능은 HWP 5.x / HWPX에서 rhwp가 추출한 구형 한양 PUA를 유니코드 자모로 바꿉니다.
아래아, 반치음, 옛이응, 순경음 비읍 등 옛자모를 현대 한글로 바꾸지 않습니다.
방점 U+302E/U+302F, 채움문자 U+115F/U+1160, 확장 자모도 그대로 유지합니다.

## 사용법

옛한글 전용 도구 `read_hwp_old_hangul`:

```json
{"file_path":"/absolute/path/document.hwpx","include_original":true}
```

반환 JSON의 필드:

| 필드 | 의미 |
|---|---|
| `text` | 본문·머리말·꼬리말·각주·수식과 표의 변환된 추출문 |
| `original_text` | `include_original: true`일 때만 포함하는 변환 전 추출문. 원본 파일 바이트나 서식을 복원하는 필드가 아님 |
| `analysis.mapped_pua_count` | 변환 전 추출문에서 한양 매핑과 일치하는 문자 출현 수 |
| `analysis.unicode_jamo_count` | 변환 전 추출문에 이미 존재하는 기본/확장 결합 자모 수. 현대 자모도 포함하므로 옛글자 수로 해석하면 안 됨 |
| `analysis.tone_mark_count` | 변환 전 추출문의 방점 수 |
| `analysis.unmapped_pua_count` | 변환하지 않은 PUA 문자 출현 수 |
| `analysis.unmapped_pua` | 미변환 PUA 코드포인트와 출현 수. 서로 다른 코드포인트 최대 32개 |
| `analysis.unmapped_pua_list_truncated` | 목록이 32개를 넘어서 생략되었는지 여부. 총 출현 수는 생략하지 않음 |
| `analysis.warnings` | 한양 PUA 가정 및 매핑 미지원 문자에 대한 안내 |

`read_hwp`, `read_hwp_text`, `read_hwp_tables`, `convert_hwp_markdown`에서도 변환을 선택할 수 있습니다:

```json
{"file_path":"/absolute/path/document.hwp","old_hangul":"unicode"}
```

Markdown 파일 저장 (`convert_hwp_markdown`):

```json
{"file_path":"/absolute/path/document.hwpx","output_path":"/absolute/path/document.md","old_hangul":"unicode"}
```

기존 네 도구의 `old_hangul` 기본값은 `preserve`입니다. 인자를 생략하면 변환을 하지 않습니다.
`unicode`에서는 알려진 한양 PUA만 변환하고 다른 문자는 보존합니다.
서로 다른 전용 글꼴이 같은 PUA 번호를 사용할 수 있으므로 자동 판별은 하지 않습니다.
한양 PUA가 아닌 문서는 `preserve`로 읽으세요. 원본 파일은 수정하지 않습니다.

HWPX 본문의 비 ASCII XML 숫자 참조(예: `&#xF53A;`)는 WASM 파서에 전달하기 전에
메모리에서 실제 유니코드 문자로 해석합니다. 기존 엔진이 누락하던 문자를 보완하는 것으로,
이 처리는 `preserve` 모드에서도 적용됩니다. XML 속성·주석·CDATA와 ASCII 참조는 바꾸지 않습니다.

예를 들어 U+F53A는 U+1112 U+119E U+11AB (`ᄒᆞᆫ`)으로 변환됩니다.
글꼴과 렌더러에 따라 화면에서는 자모가 나뉘어 보일 수 있지만 추출 문자열에는 자모가 유지됩니다.
조합 표시에는 함초롬바탕 LVT 등 해당 자모 조합을 지원하는 글꼴과 셰이핑 환경이 필요합니다.

## 지원 범위와 제약

- HWP 5.x/HWPX의 텍스트를 대상으로 합니다. 파일이 오래되었다는 이유로 HWP 3.x 포맷까지 지원하는 것은 아닙니다.
- 스캔 이미지 OCR, 문맥에 따른 독음 추정, 현대어 번역 기능은 포함하지 않습니다.
- PUA의 뜻은 글꼴에 따라 달라집니다. 일치하는 번호가 있다는 사실만으로 문서의 인코딩을 확정할 수 없습니다.
- 매핑 미지원 PUA와 원본 표에서 출력이 빈 U+F86A는 삭제하지 않습니다.
- NFC/NFD/NFKC/NFKD 정규화, 방점 이동, 자모 재조합·현대화를 수행하지 않습니다.
- 머리말·각주·표 등은 기존 rhwp walker가 제공한 범위에서 처리합니다. 엔진에서 이미 누락된 텍스트, 텍스트박스·미주·지원하지 않는 컨트롤을 복구하지는 않습니다.
- SVG/HTML 렌더링 및 글꼴 설치에는 영향을 주지 않습니다. 이 변경은 텍스트 추출과 Markdown 변환에만 적용됩니다.
- 페이지 서식과 원래 텍스트 노드 경계는 추출문에 남지 않을 수 있습니다. `original_text`는 포렌식 용도의 원본 대체물이 아닙니다.

## 개발 버전 실행

수정된 소스 폴더에서 Node.js 20 이상으로:

```bash
npm ci
npm run build
npm test
```

MCP 클라이언트 설정 예시:

```json
{
  "mcpServers": {
    "hwp-mcp": {
      "command": "node",
      "args": ["/absolute/path/hwp-mcp/dist/server.js"]
    }
  }
}
```

실제 경로로 바꾸고 클라이언트를 재시작합니다. 이 변경이 배포되기 전에는 `npx hwp-mcp@latest`에 포함되지 않습니다.

## 데이터 출처 및 재생성

- 원저작 데이터: [KTUG HanyangPuaTableProject](http://faq.ktug.or.kr/mywiki/HanyangPuaTableProject).
- 사용한 원본: [hypua2jamocomposed.txt](https://github.com/mete0r/hypua2jamo/blob/cf030e6997529a49d67234e2f611f5b9a0af2b34/data/hypua2jamocomposed.txt).
- 고정한 저장소 커밋: `cf030e6997529a49d67234e2f611f5b9a0af2b34`.
- 원본 SHA-256: `118d90e18d53877ea8ee0034936ffcffd8d4fc0e88e8f7a27cd53fff6ff46585`.
- 원본 헤더의 라이선스 선언: “This file is in Public Domain.”
- hypua2jamo의 실행 코드는 복사하지 않았습니다. 독립적으로 생성한 표는 공개된 사실 데이터만 사용합니다.
- 원본 5,661개 행 중 출력이 빈 U+F86A를 제외한 **5,660개** 매핑을 포함합니다. 행 끝 `%%%` 주석의 과거 값은 매핑에 포함하지 않습니다.

고정 버전의 원본 파일을 내려받은 뒤:

```bash
node scripts/generate-old-hangul-map.mjs /path/to/hypua2jamocomposed.txt
git diff -- src/core/data/hanyang-pua.ts
```

생성기는 원본 체크섬을 검사하고 잘못된 행·중복 키·예상하지 못한 항목 수를 거부합니다.
생성된 TypeScript가 배포 코드에 포함되므로 런타임 다운로드는 필요 없습니다.

유니코드 자모·채움문자 관련 설명: [Unicode Korean FAQ](https://www.unicode.org/faq/korean.html).

## 검증

단위 테스트는 알려진 문자와 정정된 매핑, 현대 한글·한자·이모지 보존,
확장 자모·방점·채움문자 보존, 전체 매핑의 멱등성, 미지원 PUA 진단을 검사합니다.
통합 테스트는 생성한 HWP/HWPX 문서를 실제 WASM 엔진으로 읽고,
표·머리말·꼬리말·각주 및 UTF-8 Markdown 저장과 MCP 호출을 확인합니다.
HWPX 테스트에는 XML 숫자 참조와 분리된 텍스트 run도 포함합니다.

테스트 문서는 합성 자료입니다. 실제 한컴 작성 고문헌 파일은 제공되지 않았으므로
특수 글꼴·컨트롤을 쓰는 실제 문서에서의 호환성은 별도 확인이 필요합니다.
