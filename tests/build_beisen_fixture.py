from pathlib import Path
import sys

from bs4 import BeautifulSoup


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: build_beisen_fixture.py <source-html> <output-html>")

    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    soup = BeautifulSoup(source.read_text(encoding="utf-8"), "html.parser")

    for script in soup.find_all("script"):
        script.decompose()
    for link in soup.find_all("link"):
        link.decompose()

    if soup.head is None:
        head = soup.new_tag("head")
        soup.html.insert(0, head)
    charset = soup.new_tag("meta", charset="utf-8")
    soup.head.insert(0, charset)
    style = soup.new_tag("style")
    style.string = """
      body { font-family: sans-serif; padding: 20px; }
      .sc-iAKWXU { display: block; margin: 18px 0; padding: 12px; border: 1px solid #ddd; }
      .form-item { display: block; margin: 8px 0; }
      .form-item__text { display: inline-block; min-width: 180px; }
      input, textarea, .phoenix-select { display: inline-block; min-width: 260px; min-height: 30px; }
      [id$="_addButton"] { display: block; margin: 8px 0; cursor: pointer; color: #06777c; }
      .harness-dropdown { position: fixed; z-index: 99999; left: 20px; top: 20px; background: white; border: 1px solid #999; }
      .phoenix-option { display: block; padding: 6px 10px; cursor: pointer; }
      #harness-results { white-space: pre-wrap; background: #111; color: #eee; padding: 14px; }
    """
    soup.head.append(style)

    bootstrap = soup.new_tag("script")
    bootstrap.string = """
      globalThis.__jobAutofillListeners = [];
      globalThis.chrome = {
        runtime: {
          onMessage: {
            addListener(listener) {
              globalThis.__jobAutofillListeners.push(listener);
            }
          }
        }
      };
    """
    soup.body.append(bootstrap)

    for source_path in [
        "../shared/profile.js",
        "../shared/matcher.js",
        "../content.js",
        "beisen-harness.js",
    ]:
        script = soup.new_tag("script", src=f"{source_path}?v=0.4.4", charset="utf-8")
        soup.body.append(script)

    output.write_text(str(soup), encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
