import sys,math
import numpy as np
from PIL import Image,ImageDraw,ImageFont
mask=np.fromfile('.scratch-ro-maze-walk.bin',dtype=np.uint8).reshape(200,200)
S=3.4;left=90;top=84;size=680
im=Image.new('RGB',(880,960),'#101b2b');draw=ImageDraw.Draw(im)
fontpath='C:/Windows/Fonts/msjh.ttc'
f=lambda n:ImageFont.truetype(fontpath,n)
draw.text((36,20),'迷宮森林：怪物潮站位分析',font=f(28),fill='#eff5ff')
draw.text((36,57),'依碰撞格繪製；亮色＝可走區域，座標採遊戲小地圖顯示方式',font=f(16),fill='#b8c6dc')
arr=np.zeros((200,200,3),dtype=np.uint8);arr[:]=[29,42,60];arr[mask==1]=[199,208,213]
base=Image.fromarray(arr).resize((size,size),Image.Resampling.NEAREST);im.paste(base,(left,top));draw=ImageDraw.Draw(im)
for cell in range(0,201,20):
 p=left+cell*S;draw.line((p,top,p,top+size),fill='#536279',width=1)
 draw.text((p-9,top+size+7),str(cell),font=f(12),fill='#aabbd0')
 q=top+cell*S;draw.line((left,q,left+size,q),fill='#536279',width=1)
 draw.text((left-33,q-8),str(200-cell),font=f(12),fill='#aabbd0')
points=[('A',94,50,'#36db9a',(-18,12)),('B',108,95,'#ffca59',(24,10)),('C',105,112,'#64b8ff',(22,-28))]
for label,x,y,color,(dx,dy) in points:
 px=left+(x+.5)*S;py=top+(199-y+.5)*S
 draw.ellipse((px-7,py-7,px+7,py+7),fill=color,outline='#101b2b',width=2)
 tx=px+dx;ty=py+dy;text=f'{label} ({x}, {y})';bbox=draw.textbbox((tx,ty),text,font=f(18));draw.rounded_rectangle((bbox[0]-5,bbox[1]-3,bbox[2]+5,bbox[3]+3),radius=5,fill='#101b2b');draw.text((tx,ty),text,font=f(18),fill=color)
start=(85,72);px=left+85.5*S;py=top+127.5*S;draw.line((px-5,py-5,px+5,py+5),fill='#ff7171',width=3);draw.line((px-5,py+5,px+5,py-5),fill='#ff7171',width=3)
draw.text((34,812),'A：一般／較小出生半徑，先試下方空地中央',font=f(20),fill='#36db9a')
draw.text((34,846),'B：出生半徑較大時，試中央通道靠下的位置',font=f(20),fill='#ffca59')
draw.text((34,880),'C：出生半徑接近上限時，試中央通道靠上',font=f(20),fill='#64b8ff')
draw.text((34,921),'紅色 ×：進場位置。圖上位置是模型候選點，實戰仍受鏡頭與清怪效率影響。',font=f(15),fill='#c5d1e3')
im.save('RO-迷宮森林-怪潮站位.png')
