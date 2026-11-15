import sys,collections,json
import numpy as np
from PIL import Image
mask=np.fromfile('.scratch-ro-maze-walk.bin',dtype=np.uint8).reshape(200,200)
labels=np.full(mask.shape,-1,dtype=np.int32);sizes=[]
for y,x in zip(*np.where(mask==1)):
 if labels[y,x]>=0:continue
 label=len(sizes);q=collections.deque([(y,x)]);labels[y,x]=label;n=0
 while q:
  cy,cx=q.popleft();n+=1
  for dy,dx in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]:
   ny,nx=cy+dy,cx+dx
   if ny<0 or nx<0 or ny>=200 or nx>=200 or mask[ny,nx]!=1 or labels[ny,nx]>=0:continue
   if dx and dy and (mask[cy,nx]!=1 or mask[ny,cx]!=1):continue
   labels[ny,nx]=label;q.append((ny,nx))
 sizes.append(n)
print('components',sizes,'start',labels[127,85])
np.save('.scratch-ro-maze-labels.npy',labels)
# Draw raw collision for inspection.
Image.fromarray(np.where(mask[:,:,None]==1,np.array([220,220,220],dtype=np.uint8),np.array([30,30,30],dtype=np.uint8)).astype('uint8')).resize((600,600)).save('.scratch-ro-maze-collision.png')
