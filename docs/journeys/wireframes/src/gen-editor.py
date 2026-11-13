# Generates 05-editor.html and 06-editor-no-room.html from one template so they stay consistent.
import pathlib
here = pathlib.Path(__file__).parent

def editor(noroom: bool) -> str:
    lanes_room = [
        ("Left", "Desk lamp, Shelf strip", "", [(120,"#c33"),(300,"#c33"),(520,"#33c")]),
        ("Center", "TV bias light", "", [(300,"#fa0"),(700,"#222")]),
        ("Right", "Floor lamp", "", [(120,"#c33"),(520,"#33c")]),
    ]
    menubar_right = (
        '<span class="lbl" style="display:inline;margin:0">Preview on</span> '
        + ('<span class="field disabled" style="min-width:120px;color:#aaa">No rooms ▾</span> <span class="btn small disabled" title="Set up a room first">Lights: Off</span>'
           if noroom else
           '<span class="field" style="min-width:120px">Living Room ▾</span> <span class="btn small" style="background:#ffe9a8">Lights: On ●</span>')
        + ' <span class="btn primary">Watch in Emby</span>'
    )
    banner = ('<div class="abs banner" style="left:0;right:0;top:40px;height:34px;padding:7px 14px"><b>Set up a room to preview on your lights.</b> You can still write and save this track. <span class="btn small">Set up a room</span></div>'
              if noroom else '')
    top = 74 if noroom else 40
    lanes = []
    y = 0
    for name, bulbs, extra, kfs in lanes_room:
        label = f'<b>{name}</b>' + ('' if noroom else f' — <span class="muted">{bulbs}</span>')
        sm = '<span class="btn small">S</span><span class="btn small">M</span>'
        diamonds = ''.join(f'<i class="kf" style="left:{x}px;background:{c}"></i>' for x, c in kfs)
        strip = ''.join(f'<span class="seg" style="left:{kfs[i][0]}px;width:{(kfs[i+1][0] if i+1 < len(kfs) else 940)-kfs[i][0]}px;background:{kfs[i][1]}"></span>' for i in range(len(kfs)))
        lanes.append(f'<div class="lane" style="top:{y}px"><div class="lh">{label}<div style="margin-top:2px">{sm}</div></div><div class="lb">{strip}{diamonds}</div></div>')
        y += 46
    fx = '<div class="fx" style="left:560px;top:3px;width:90px">LIGHTNING</div>'
    sel = '<div class="selring" style="left:297px;top:53px"></div>'
    noroom_label = 'no room' if noroom else 'Living Room'
    return f'''<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="wf.css"><title>Editor</title>
<style>
.mb{{position:absolute;left:0;right:0;top:0;height:40px;border-bottom:2px solid #999;background:#eee;display:flex;align-items:center;gap:6px;padding:0 10px}}
.mb .m{{padding:3px 10px;border:1px solid transparent}} .mb .m.open{{border:1px solid #333;background:#fff}}
.video{{position:absolute;left:12px;width:840px;height:350px;background:#444;color:#ddd;display:flex;align-items:center;justify-content:center;font-size:14px}}
.transport{{position:absolute;left:12px;width:840px;height:36px;display:flex;align-items:center;gap:6px;justify-content:center;border:1px solid #888;background:#f4f4f4}}
.insp{{position:absolute;left:866px;right:12px;padding:10px}}
.tl{{position:absolute;left:12px;right:12px;bottom:12px;border:1px solid #888;background:#fafafa}}
.tlh{{height:30px;display:flex;align-items:center;gap:8px;padding:0 8px;border-bottom:1px solid #bbb}}
.ruler{{position:absolute;left:200px;right:0;top:30px;height:28px;background:#ddd;border-bottom:1px solid #888;font-size:10px}}
.ruler span{{position:absolute;top:2px}}
.lanes{{position:absolute;left:0;right:0;top:58px;bottom:0}}
.lane{{position:absolute;left:0;right:0;height:46px;border-bottom:1px solid #ccc}}
.lh{{position:absolute;left:0;width:200px;top:0;bottom:0;padding:4px 6px;border-right:1px solid #999;background:#f0f0f0;font-size:11px}}
.lb{{position:absolute;left:200px;right:0;top:0;bottom:0}}
.seg{{position:absolute;top:30px;height:8px;opacity:.55}}
.kf{{position:absolute;top:12px;width:12px;height:12px;transform:rotate(45deg);border:1px solid #000}}
.ph{{position:absolute;top:30px;bottom:0;width:2px;background:#d00}}
.fx{{position:absolute;height:22px;border:1px solid #333;background:#ddd;font-size:10px;text-align:center;line-height:22px}}
.selring{{position:absolute;width:22px;height:22px;border:2px solid #d00;border-radius:11px}}
</style></head><body>
<div class="mb"><span class="m{' open' if not noroom else ''}">File</span><span class="m">Edit</span><span class="m">Help</span>
<span style="flex:1;text-align:center"><b>John Wick lighting</b> · <span class="muted">{'Unsaved changes' if not noroom else 'Saved 2 min ago'}</span></span>{menubar_right}</div>
{banner}
<div class="video" style="top:{top+10}px">VIDEO (edit proxy) — no seek bar here</div>
<div class="transport" style="top:{top+364}px"><span class="btn small">⏮ −5 s</span><span class="btn small">◀ frame</span><span class="btn primary">▶ Play</span><span class="btn small">frame ▶</span><span class="btn small">+5 s ⏭</span><span style="margin-left:16px;font-family:monospace">0:13:56.470 / 1:41:04</span></div>
<div class="insp box" style="top:{top+10}px;height:390px">
<div class="h">Keyframe · Center at 0:13:56.470</div>
<span class="lbl">Time</span><span class="field">0:13:56.470</span>
<div class="row" style="margin-top:8px"><div><span class="lbl">Color</span><span class="field" style="min-width:90px"><span style="display:inline-block;width:12px;height:12px;background:#fa0;border:1px solid #000"></span> #FFAA00</span></div><span class="btn small">Eyedropper</span></div>
<div class="row" style="margin-top:4px"><span class="field" style="min-width:60px">R 255</span><span class="field" style="min-width:60px">G 170</span><span class="field" style="min-width:60px">B 0</span><span class="btn small">K</span></div>
<span class="lbl" style="margin-top:8px">Brightness</span><div class="row"><div style="flex:1;height:6px;background:#bbb;position:relative"><div style="position:absolute;left:60%;top:-5px;width:10px;height:16px;background:#333"></div></div><span class="field" style="min-width:50px">60</span></div>
<span class="lbl" style="margin-top:8px">Fade into this keyframe</span><div class="row"><span class="btn small">Step</span><span class="btn small primary">Linear</span><span class="field" style="min-width:70px">800 ms</span></div>
<div style="margin-top:14px"><span class="btn small">Delete keyframe</span></div>
<div class="muted" style="margin-top:12px;font-size:11px">Nothing selected → shows the channel (default color, brightness, bulbs it reaches) or the hint "Click a lane to add a keyframe at that time".</div>
</div>
<div class="tl" style="top:{top+412}px">
<div class="tlh"><b>Timeline</b><span class="chip">Layout 3.0 ▾</span><span class="muted" style="font-size:11px">{'Zoomed to 0:13:50–0:14:10 (Fit shows the whole movie). Lanes show the bulbs they reach in ' + noroom_label if not noroom else 'No room: lanes show positions only'}</span><span style="flex:1"></span><span class="btn small">−</span><span class="btn small">+</span><span class="btn small">Fit</span></div>
<div class="ruler"><span style="left:0">0:13:50</span><span style="left:235px">0:13:55</span><span style="left:470px">0:14:00</span><span style="left:705px">0:14:05</span><span style="left:900px">0:14:10</span><span style="left:340px;top:14px;color:#a00">◆ click / drag here to move the playhead</span></div>
<div class="lanes">{''.join(lanes)}<div class="abs" style="left:200px;right:0;top:0;bottom:0">{fx}{sel}</div></div>
<div class="ph" style="left:504px"></div>
</div>
<div class="callout" style="left:230px;top:{top+568}px">Click empty lane space = add keyframe here · click ◆ = select · drag ◆ = move</div>
{'' if noroom else '<div class="menu" style="left:10px;top:38px;width:250px"><div>New track…</div><div>Open…</div><div>Open a .lightfx file…</div><div class="sep"></div><div><span>Save</span><span class="muted">Ctrl+S</span></div><div>Export .lightfx…</div><div class="sep"></div><div>Close</div></div>'}
<div class="wf-label">{'06 — Editor with no rooms · J1 Step 4 · EDIT-010' if noroom else '05 — Editor (room exists, File menu open, Lights on) · J1 Step 4 · EDIT-001…014'}</div>
</body></html>'''

(here / '05-editor.html').write_text(editor(False))
(here / '06-editor-no-room.html').write_text(editor(True))
