import html.parser

class HTMLTagChecker(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.errors = []
        
    def handle_starttag(self, tag, attrs):
        self.stack.append((tag, self.getpos()))
        
    def handle_endtag(self, tag):
        if not self.stack:
            self.errors.append(f"Unexpected closing tag </{tag}> at line {self.getpos()[0]}")
            return
        expected, pos = self.stack.pop()
        while expected != tag and self.stack:
            self.errors.append(f"Missing closing tag for <{expected}> from line {pos[0]}, got </{tag}> at line {self.getpos()[0]}")
            expected, pos = self.stack.pop()

with open(r"c:\Users\julia\.antigravity-ide\lyrical-inventory\index.html", "r", encoding="utf-8") as f:
    content = f.read()

checker = HTMLTagChecker()
checker.feed(content)
if checker.stack:
    for tag, pos in reversed(checker.stack):
        print(f"Unclosed tag <{tag}> at line {pos[0]}")
if checker.errors:
    for err in checker.errors:
        print(err)
