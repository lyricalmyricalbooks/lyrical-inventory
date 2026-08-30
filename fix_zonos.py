import re

with open("tests/zonos.test.js", "r") as f:
    content = f.read()

# Add try/catch wrapper if necessary, or modify the test to correctly handle
# the rejected promise the same way we do in other places where we mock fetch.
# The error happens around line 485.

# Let's see what happens there.
with open("zonos_test_part.txt", "w") as f:
    f.write(content[14000:])
