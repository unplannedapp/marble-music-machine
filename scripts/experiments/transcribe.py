# Transcribe a melody from audio for a machine: decode the track to mono 22050 Hz float32 first
#   ffmpeg -i song.mp3 -ac 1 -ar 22050 -f f32le calm.f32
# then run this in the same directory (needs numpy, scipy, librosa). Writes calm.melody.json:
# tempo, key, a chord per bar (for song.backing) and the top-voice notes on an eighth-note grid.
# The top voice is the highest CQT bin within 12 dB of each frame's peak, held with hysteresis.
import numpy as np, librosa, json
from scipy.ndimage import median_filter
sr = 22050; hop = 512
y = np.fromfile('calm.f32', dtype=np.float32)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop, units='time')
tempo = float(np.atleast_1d(tempo)[0]); spb = 60 / tempo
yh = librosa.effects.harmonic(y, margin=3.0)
fmin = librosa.note_to_hz('C2'); base = int(round(librosa.hz_to_midi(fmin)))
C = np.abs(librosa.cqt(yh, sr=sr, hop_length=hop, fmin=fmin, n_bins=72, bins_per_octave=12))
Cdb = librosa.amplitude_to_db(C, ref=np.max)
times = librosa.frames_to_time(np.arange(C.shape[1]), sr=sr, hop_length=hop)
# Key from chroma
chroma = librosa.feature.chroma_cqt(C=C, sr=sr, hop_length=hop)
prof = chroma.mean(axis=1)
names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
major = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]); minor = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
best = max(((np.corrcoef(np.roll(major, k), prof)[0,1], names[k], 'major') for k in range(12)), key=lambda t: t[0])
bestm = max(((np.corrcoef(np.roll(minor, k), prof)[0,1], names[k], 'minor') for k in range(12)), key=lambda t: t[0])
key = best if best[0] >= bestm[0] else bestm
print('tempo', round(tempo,1), 'key', key[1], key[2], 'corr', round(key[0],2))
# scale pitch classes for snapping
tonic = names.index(key[1]); steps = [0,2,4,5,7,9,11] if key[2]=='major' else [0,2,3,5,7,8,10]
scale = set((tonic + s) % 12 for s in steps)
# Top voice with hysteresis
raw = np.full(C.shape[1], -1)
for i in range(C.shape[1]):
    col = Cdb[:, i]; pk = col.max()
    if pk < -42: continue
    cand = np.where(col >= pk - 12)[0]
    # only consider the melody register C4..C7
    cand = cand[(cand >= 24) & (cand <= 60)]
    if len(cand): raw[i] = cand.max()
track = np.full_like(raw, -1)
cur = -1; run = 0; pend = -1
for i, p in enumerate(raw):
    if p == pend: run += 1
    else: pend = p; run = 1
    if run >= 5: cur = pend
    track[i] = cur
# Notes
notes = []
cur = None
for i in range(len(track)):
    p = int(track[i]); t = float(times[i])
    if p < 0:
        if cur: notes.append(cur); cur = None
        continue
    if cur and cur['p'] == p: cur['end'] = t
    else:
        if cur: notes.append(cur)
        cur = {'p': p, 'start': t, 'end': t}
if cur: notes.append(cur)
# quantise to 8th notes and snap pitch class to the key when a semitone off
grid = spb / 2
out = []
for n in notes:
    b = round(n['start'] / grid) * grid
    dur = n['end'] - n['start']
    if dur < 0.11: continue
    midi = base + n['p']
    pc = midi % 12
    if pc not in scale:
        # nearest scale degree
        midi += min((k for k in (-1, 1) if (pc + k) % 12 in scale), key=abs, default=0)
    if out and abs(out[-1]['t'] - b) < 1e-6:
        if dur > out[-1]['dur']: out[-1].update(midi=midi, dur=dur)
        continue
    if out and out[-1]['midi'] == midi and b - out[-1]['t'] < grid * 1.5 and out[-1]['dur'] < 0.25:
        out[-1]['dur'] = max(out[-1]['dur'], (b + dur) - out[-1]['t']); continue
    out.append({'t': b, 'midi': midi, 'dur': dur})
# Chords per bar from chroma
bar = spb * 4
chords = []
triads = {}
for k in range(12):
    triads[names[k]] = [k, (k+4)%12, (k+7)%12]; triads[names[k]+'m'] = [k, (k+3)%12, (k+7)%12]
nb = int(times[-1] / bar)
for bi in range(nb):
    sel = chroma[:, (times >= bi*bar) & (times < (bi+1)*bar)]
    if sel.shape[1] == 0: chords.append('C'); continue
    v = sel.mean(axis=1)
    sc = {name: sum(v[p] for p in pcs) for name, pcs in triads.items()}
    # prefer diatonic
    dia = {n: s for n, s in sc.items() if all(p in scale for p in triads[n])}
    chords.append(max(dia, key=dia.get) if dia else max(sc, key=sc.get))
print('bars', nb, 'chords (first 20):', chords[:20])
json.dump({'tempo': tempo, 'key': key[1] + ('' if key[2]=='major' else 'm'), 'chords': chords, 'notes': [{'beat': round(n['t']/spb, 2), 'note': librosa.midi_to_note(n['midi'], unicode=False), 'dur': round(n['dur'],2)} for n in out]}, open('calm.melody.json','w'))
print('notes', len(out))
line = []
for n in out:
    if n['t'] > 48: break
    line.append(f"{n['t']/spb:5.1f}:{librosa.midi_to_note(n['midi'], unicode=False)}")
print(' '.join(line))
