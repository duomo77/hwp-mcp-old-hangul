# 옛한글 텍스트 추출과 HWPX 수정

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

## HWPX 옛한글 수정

`replace_hwp_text`와 `fill_hwp_template`에도 `old_hangul` 선택 인자를 추가했습니다.
기본값 `preserve`는 원래 문자 인코딩으로 검색합니다. `unicode`는 검색할 때만 알려진 한양 PUA를
결합 자모로 풀어 비교하므로, `read_hwp_old_hangul`의 `text`에서 가져온 문자열로 원본 PUA를 찾을 수 있습니다.
치환 대상이 아닌 문자는 PUA/숫자 참조의 원래 표기를 유지하며, `new_text`는 입력한 문자 그대로 저장합니다.
`unicode`는 파일 전체의 인코딩이나 글꼴을 바꾸는 옵션이 아닙니다.

`replace_hwp_text` 예시 (`ᄒᆞᆫ〮` = U+1112 U+119E U+11AB U+302E):

```json
{
  "file_path": "/absolute/path/document.hwpx",
  "old_text": "ᄒᆞᆫ〮",
  "new_text": "교정한 ᄒᆞᆫ〮",
  "old_hangul": "unicode",
  "output_path": "/absolute/path/document_corrected.hwpx"
}
```

- 같은 문단의 인접한 run에 나뉜 자모, XML 숫자·기본 이름 참조, 같은 노드 안의 반복 출현을 검색합니다.
- 문단·표 셀·컨트롤·주석·CDATA 경계를 넘어서 연결하지 않습니다. CDATA 내부는 검색·치환하지 않습니다.
- PUA 한 글자를 풀어 만든 자모 중 일부만 바꾸는 검색은 일치로 처리하지 않습니다. 전체 글자를 검색하세요.
- 템플릿 키는 JSON 열거 순서대로 적용됩니다. 앞의 치환 결과가 뒤의 키와 일치하면 다시 바뀔 수 있습니다.
- 비어 있는 검색어, 문자열이 아닌 템플릿 값, 잘못된 모드와 XML에 쓸 수 없는 치환 문자는 저장 전에 거부합니다.
- 문단 전체 수정은 쪽 설정·중첩 표를 보존하고, 해당 문단 자체의 첫 텍스트 노드에 새 문자열을 넣습니다.
  표 셀 전체 수정은 첫 문단에 넣고 나머지 텍스트를 비웁니다. 중첩 표 셀 수정은 지원하지 않습니다.
- 기존 위치 기반 수정 도구는 첫 번째 section을 대상으로 하며 문단 인덱스는 문서 순서의 중첩 문단도 포함합니다.
- 분리된 run을 가로지르는 치환은 첫 일치 위치의 run에 새 문자열을 넣고 뒤쪽 일치 문자를 지웁니다.
  run 태그와 서식 참조는 유지되지만 새 글자는 첫 run의 글꼴·서식을 따릅니다.
  구형 전용 글꼴의 PUA를 유니코드로 교정하면 해당 조합을 표시할 수 있는 글꼴을 별도로 확인해야 합니다.
- 출력 경로를 생략하면 별도 `_modified.hwpx` / `_filled.hwpx` 파일을 만듭니다.
  원본을 보존하려면 입력과 다른 `output_path`를 지정하세요. 같은 경로를 명시하면 덮어씁니다.

**HWP 5.x는 읽기만 지원합니다. `.hwp` 수정·저장은 구현하지 않았습니다.**
한컴오피스에서 `.hwpx`로 저장한 뒤 수정해야 합니다. 확장자 이름만 바꾸면 변환되지 않습니다.
텍스트 서식·필드·행열 추가·병합 등 기존 도구 전부가 옛한글에서 검증된 것은 아닙니다.
특히 `apply_hwp_text_style`에는 PUA/유니코드 동등 검색 옵션을 추가하지 않았습니다.

## 지원 범위와 제약

- HWP 5.x/HWPX의 텍스트를 대상으로 합니다. 파일이 오래되었다는 이유로 HWP 3.x 포맷까지 지원하는 것은 아닙니다.
- 스캔 이미지 OCR, 문맥에 따른 독음 추정, 현대어 번역 기능은 포함하지 않습니다.
- PUA의 뜻은 글꼴에 따라 달라집니다. 일치하는 번호가 있다는 사실만으로 문서의 인코딩을 확정할 수 없습니다.
- 매핑 미지원 PUA와 원본 표에서 출력이 빈 U+F86A는 삭제하지 않습니다.
- NFC/NFD/NFKC/NFKD 정규화, 방점 이동, 자모 재조합·현대화를 수행하지 않습니다.
- 머리말·각주·표 등은 기존 rhwp walker가 제공한 범위에서 처리합니다. 엔진에서 이미 누락된 텍스트, 텍스트박스·미주·지원하지 않는 컨트롤을 복구하지는 않습니다.
- SVG/HTML 렌더링 및 글꼴 설치에는 영향을 주지 않습니다. 텍스트 보존 검증이 화면의 글꼴 셰이핑이나 쪽 배치 검증을 뜻하지 않습니다.
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
수정 테스트는 생성·문단 추가·반복 치환·PUA/Unicode 동등 검색·템플릿·문단·표 셀을
저장 후 다시 열어 검사하고, 원본 바이트와 치환 대상 밖 ZIP 파일의 보존도 확인합니다.
상세 결과와 제약: [수정 검증 보고서](OLD_HANGUL_EDIT_VERIFICATION_KO.md).

테스트 문서는 합성 자료입니다. 실제 한컴 작성 고문헌 파일은 제공되지 않았으므로
특수 글꼴·컨트롤을 쓰는 실제 문서에서의 호환성은 별도 확인이 필요합니다.
