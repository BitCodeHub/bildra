# Bimcraft -> Bildra: every name a person sees. Keeps code identifiers (bimcraft.js, BIMCRAFT_*),
# the CadCraft_* IFC property sets the app writes and reads back, and plain references to the
# CadCraft sister apps ("open it in CivilCraft"), which the trademark terms allow.
import subprocess, pathlib, re, sys
SKIP = ('fixtures/', 'tests/', 'web/v0.4/', 'LICENSE', 'NOTICE', 'PROVENANCE.md', 'THIRD_PARTY.md', 'TRADEMARKS.md')
SENTENCES = [  # (old, new), applied before the word swaps
  ('is the building-model app of the CadCraft family', 'is a building-model app, based on the open-source BimCraft'),
  ('is uploaded** to CadCraft or anyone else', 'is uploaded** anywhere'),
  ('is uploaded\\u003C/strong\\u003E to CadCraft or anyone else', 'is uploaded\\u003C/strong\\u003E anywhere'),
  ('is uploaded</strong> to CadCraft or anyone else', 'is uploaded</strong> anywhere'),
  ('The thin bar across the top belongs to the CadCraft site, not to BimCraft itself.', 'The thin bar across the top is the app bar.'),
  ('The CadCraft mark: goes to the CadCraft home page.', 'The Bildra mark and name.'),
  ('The CadCraft library on this site', 'The CadCraft online library'),
  ('the CadCraft library on this site', 'the CadCraft online library'),
  ('<meta name="generator" content="CadCraft browser edition">', '<meta name="generator" content="Bildra browser edition">'),
]
WORDS = [
  ('com.getcadcraft.bimcraft', 'cloud.agentlumi.bildra'),
  ('CadCraft Studio', 'Bildra Desktop'),
  ('BimCraft', 'Bildra'), ('Bimcraft', 'Bildra'),
]
# The open-source credit stays where it is said on purpose.
KEEP = 'the open-source BimCraft'
files = subprocess.run(['git', 'ls-files'], capture_output=True, text=True).stdout.split('\n')
changed = 0
for f in files:
    if not f or f.startswith(SKIP) or f in SKIP: continue
    p = pathlib.Path(f)
    try: s = p.read_text()
    except (UnicodeDecodeError, IsADirectoryError, FileNotFoundError): continue
    t = s
    for a, b in SENTENCES: t = t.replace(a, b)
    t = t.replace(KEEP, '\0KEEP\0')
    for a, b in WORDS: t = t.replace(a, b)
    t = t.replace('\0KEEP\0', KEEP)
    if t != s: p.write_text(t); changed += 1
print('files changed', changed)
