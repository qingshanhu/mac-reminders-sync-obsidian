"""Verify release ZIP layout, UTF-8 names, executable mode and absence of runtime data."""
from pathlib import Path, PurePosixPath
import json
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'manifest.json').read_text())['version']
for archive, prefix, full in [
    (f'mac-reminders-sync-obsidian-v{version}-universal.zip', 'mac-reminders-sync-obsidian/', True),
    (f'work-reminders-sync-v{version}-plugin.zip', 'work-reminders-sync/', False),
]:
    with zipfile.ZipFile(root / 'dist' / archive) as z:
        names = z.namelist()
        for item in z.infolist():
            p = PurePosixPath(item.filename)
            assert not p.is_absolute() and '..' not in p.parts, item.filename
            assert p.name not in {'data.json', 'last-backup.md', 'conflicts.jsonl'}, item.filename
            assert '.obsidian' not in p.parts, item.filename
            if not item.filename.isascii():
                assert item.flag_bits & 0x800, 'Missing UTF-8 ZIP filename flag'
        plugin = prefix + ('plugin/work-reminders-sync/' if full else '')
        for filename in ['main.js', 'manifest.json', 'styles.css', 'RemindersBridge.app/Contents/Info.plist']:
            assert plugin + filename in names, filename
        binary = z.getinfo(plugin + 'RemindersBridge.app/Contents/MacOS/reminders-bridge')
        assert (binary.external_attr >> 16) & 0o111, 'Lost executable mode'
        if full:
            for filename in ['README.md', 'LICENSE', 'scripts/install.mjs', 'templates/待办资料/待办清单.md', 'docs/使用说明.md', 'docs/故障排查.md']:
                assert prefix + filename in names, filename
            assert '<!-- mr:' not in z.read(prefix + 'templates/待办资料/待办清单.md').decode('utf-8')
    print(archive + ': layout, UTF-8 names, executable mode and runtime-data exclusion verified')
