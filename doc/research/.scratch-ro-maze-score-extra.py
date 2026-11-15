import sys,json,math,time
import numpy as np
from PIL import Image,ImageDraw,ImageFont
mask=np.fromfile('.scratch-ro-maze-walk.bin',dtype=np.uint8).reshape(200,200)
y,x=np.where(mask==1);inside=(x>=14)&(x<186)&(y>=14)&(y<186);x=x[inside]+.5;y=y[inside]+.5
rng=np.random.default_rng(20261115)
angles=np.linspace(0,2*np.pi,720,endpoint=False)
results={}; maps=[]
for reach in [800,1000,1200]:
 scores=np.zeros(len(x),dtype=float)
 for angle in angles:
  for trial in range(3):
   a=angle+rng.uniform(-.02,.02);c=math.cos(a);s=math.sin(a);ok=np.zeros(len(x),dtype=bool)
   for extra in [0,90,180]:
    r=(reach+90+extra+rng.uniform(0,40))/32
    xx=np.floor(x+c*r).astype(int);yy=np.floor(y+s*r).astype(int)
    bounds=(xx>=14)&(xx<186)&(yy>=14)&(yy<186)
    valid=bounds&(mask[np.clip(yy,0,199),np.clip(xx,0,199)]==1)
    ok|=valid
   scores+=ok
 scores/=len(angles)*3
 order=np.argsort(scores)[::-1];best=int(order[0]);grid=np.full((200,200),np.nan);grid[y.astype(int),x.astype(int)]=scores;np.save(f'.scratch-ro-maze-score-{reach}.npy',grid)
 top=[{'x':int(x[i]),'y':199-int(y[i]),'gridy':int(y[i]),'score':round(float(scores[i]),4)} for i in order[:10]]
 results[str(reach)]={'best':top[0],'top':top,'start':round(float(scores[np.argmin((x-85.5)**2+(y-127.5)**2)]),4)}
 print(reach,results[str(reach)]['best'],'start',results[str(reach)]['start'],flush=True)
json.dump(results,open('.scratch-ro-maze-results.json','w'),indent=2)

