import glob
import sys; sys.path.insert(0, "/home/claude/src/build")  # the shared helpers live with the sources
from build_inst import build
S="/home/claude/src/"
tg=[28,31,34,37,40,43,46,49,52,55,58]
kw=dict(rms=0.16,fade=0.3)
SR=44100
build("fashionbass","Round bass","bass",sorted(glob.glob(S+"karoryfer.fashionbass/notes/*_mf_rr1.wav")),tg,2.6,SR,0.15,"Karoryfer Samples, Fashionbass",**kw)
build("swagbass","Fabric bass","bass",sorted(glob.glob(S+"karoryfer.swagbass/notes/*_f_rr1.wav")),tg,2.6,SR,0.12,"Karoryfer Samples, Swagbass",**kw)
build("growlybass","Jazz bass","bass",sorted(glob.glob(S+"karoryfer.growlybass/sustain/*_f_rr1.wav")),tg,2.6,SR,0.15,"Karoryfer Samples, Growlybass",**kw)
build("fingerbass","Flatwound bass","bass",sorted(glob.glob(S+"karoryfer.pastabass/samples/fetuccine/*_vl2_rr1.wav")),[28,31,34,37,40,43,46,49,52,55,58,61],2.6,SR,0.15,"Karoryfer Samples, Pastabass (fingered, flatwound)",**kw)
build("doublebass","Double bass","bass",sorted(glob.glob("/home/claude/smpldsnds/sfzinstruments-dsmolken-double-bass/pizz/pizz_*_ma.ogg")),[24,27,31,34,38,41,45,48,52,55],3.0,SR,0.25,"D. Smolken, Otto Rubner double bass (pizzicato)",**kw)
