// DV58 FROST: the ice. Two WebGL canvases share one camera that matches the page's CSS perspective exactly, so every slab
// sits under its DOM card (the text stays DOM, sharp, above the ice).
//   back canvas (under the DOM): the navy night with bokeh, light shafts and wind streaks (rendered at half resolution into
//            a texture the ice refracts), a cold glow + hoar-frost fur behind each card, the thick ice slabs with their
//            bevels, frosted crust, crystal veins, sparkles, a light sweep and icicles, and drifting frost dust.
//   fx canvas (over the DOM, pointer-events none): shatter shards, frost particle bursts and mist, and the speed streaks
//            of an arriving card. Everything in flight is animated in the vertex shaders from one start time, so a burst
//            costs the CPU nothing per frame; meshes come from pools made at load.
import * as THREE from 'three';

const NOISE = `
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.7); a*=.5; } return s; }
float cells(vec2 p){ vec2 i=floor(p), f=fract(p); float d1=8., d2=8.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(x,y); vec2 o=vec2(hash(i+g), hash(i+g+19.7));
    float d=length(g+o-f); if(d<d1){ d2=d1; d1=d; } else if(d<d2) d2=d; }
  return d2-d1; }
float sdRR(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
`;

// ---------------------------------------------------------------- background (half resolution, refracted by the ice)
const BG_FS = `precision highp float;
uniform vec2 uRes; uniform vec2 uView; uniform vec2 uAnchor; uniform vec2 uStack; uniform float uTime; uniform float uStreak;
${NOISE}
void main(){
  vec2 px=gl_FragCoord.xy/uRes*uView; px.y=uView.y-px.y;           // CSS px of the canvas, y down
  float k=clamp(min(uView.x, 900.)/900., .5, 1.);                   // scale for small screens
  vec2 a=uAnchor;
  vec3 deep=vec3(3.,15.,40.)/255., mid=vec3(11.,28.,60.)/255., glow=vec3(44.,74.,122.)/255.;
  float r=length((px-a)/vec2(max(uView.x*.5, 420.), 520.*k));
  vec3 col=mix(glow, mid, smoothstep(0., .85, r)); col=mix(col, deep, smoothstep(.75, 1.7, r));
  col+=vec3(.02,.035,.06)*(1.-smoothstep(0., 1.0, px.y/max(uView.y,1.)));
  // light shafts from the top right
  vec2 src=vec2(uView.x+80.*k, -140.*k); vec2 dv=px-src; float ang=atan(dv.y, -dv.x); float dist=length(dv)/max(uView.x, 700.);
  float ray=pow(.5+.5*sin(ang*9.+1.3+sin(ang*3.+uTime*.05)*1.2), 3.)*.6 + pow(.5+.5*sin(ang*17.-uTime*.06+.7), 4.)*.4;
  ray*=smoothstep(1.25, .05, dist)*smoothstep(-.1, .55, sin(ang*3.1+.9));
  col+=vec3(.40,.56,.74)*ray*.34;
  col+=vec3(.26,.38,.56)*smoothstep(.9, 0., dist)*.42;
  // bokeh: out-of-focus lights with slightly brighter rims
  for(int i=0;i<18;i++){
    float fi=float(i); vec2 h=vec2(hash(vec2(fi,1.7)), hash(vec2(fi,8.3)));
    vec2 c=vec2(h.x*1.1-.05, h.y*.9-.02)*uView + vec2(sin(uTime*.05+fi*1.7), cos(uTime*.04+fi*2.3))*18.*k;
    float rr=mix(22., 92., hash(vec2(fi,4.1)))*k;
    float d=length(px-c)/rr; float disc=smoothstep(1., .86, d); float rim=smoothstep(.70, .97, d)*disc;
    float al=(.07+.16*hash(vec2(fi,2.9)))*(.75+.25*sin(uTime*.35+fi*2.1));
    float up=smoothstep(uView.y*.95, uView.y*.15, c.y);         // more of them up high, like the concept
    col+=mix(vec3(.24,.37,.55), vec3(.36,.50,.68), hash(vec2(fi,6.6)))*(disc*.75+rim*.5)*al*(.35+.65*up);
  }
  // wind streaks streaming in from the left of the stack
  float sx=a.x-uStack.x*.5; float sy=(px.y-a.y)/(uStack.y*.75);
  float band=exp(-sy*sy*1.6);
  float lane=pow(vnoise(vec2(px.y*.09, 3.1)), 5.)*1.4+pow(vnoise(vec2(px.y*.23, 9.4)), 9.)*1.6;
  float flow=vnoise(vec2(px.x*.004-uTime*.18, px.y*.05));
  float env=smoothstep(sx-560.*k, sx-60.*k, px.x)*(1.-smoothstep(sx-30.*k, sx+60.*k, px.x));
  col+=vec3(.58,.77,.97)*lane*band*env*(.16+flow*.18+uStreak*.9);
  // vignette
  vec2 q=px/uView-.5; col*=1.-dot(q,q)*.55;
  gl_FragColor=vec4(col,1.);
}`;

const SCREEN_VS = `varying vec2 vUv; void main(){ vUv=position.xy*.5+.5; gl_Position=vec4(position.xy,0.,1.); }`;
const COMPOSE_FS = `precision highp float; varying vec2 vUv; uniform sampler2D uBg; uniform float uTime;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main(){ vec3 c=texture2D(uBg, vUv).rgb; c+=(h(gl_FragCoord.xy+fract(uTime)*91.)-.5)*(2.2/255.); gl_FragColor=vec4(c,1.); }`;

// ---------------------------------------------------------------- frost noise, baked once into a tileable texture
// R: fbm, G: fbm (other seed), B: crystal cells (F2-F1), A: fine fbm. The ice samples it instead of computing noise per pixel.
const BAKE_FS = `precision highp float; varying vec2 vUv;
float hp(vec2 i, float P, float s){ i=mod(i,P); return fract(sin(dot(i+s, vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p, float P, float s){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hp(i,P,s),hp(i+vec2(1,0),P,s),f.x), mix(hp(i+vec2(0,1),P,s),hp(i+vec2(1,1),P,s),f.x), f.y); }
float fb(vec2 uv, float P, float s){ float a=.5, t=0.; for(int i=0;i<5;i++){ t+=a*vn(uv*P,P,s); P*=2.; a*=.5; } return t/.97; }
float cl(vec2 uv, float P){ vec2 p=uv*P, i=floor(p), f=fract(p); float d1=8., d2=8.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(x,y); vec2 o=vec2(hp(i+g,P,3.1), hp(i+g,P,7.7)); float d=length(g+o-f); if(d<d1){ d2=d1; d1=d; } else if(d<d2) d2=d; }
  return d2-d1; }
void main(){ gl_FragColor=vec4(fb(vUv,8.,0.), fb(vUv,8.,17.3), cl(vUv,16.), fb(vUv,32.,5.9)); }`;

// ---------------------------------------------------------------- the slab
// uLayer: each card draws in its own thin depth layer by rank (newest nearest), so a newer card always covers an older
// one even where their tilted planes cross, and the GPU can still reject hidden pixels early (opaque, front to back)
const SLAB_VS = `uniform float uLayer;
varying vec3 vPos; varying vec3 vN; varying vec3 vLN; varying vec3 vV;
void main(){ vPos=position; vLN=normal; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=mv.xyz; gl_Position=projectionMatrix*mv;
  gl_Position.z=(uLayer+clamp(gl_Position.z/gl_Position.w,-1.,1.)*.002)*gl_Position.w; }`;
const SLAB_FS = `precision highp float;
uniform sampler2D uBg; uniform sampler2D uNoise; uniform vec2 uRes; uniform float uTime; uniform vec3 uSize; uniform float uSeed; uniform float uHover; uniform float uMotion;
varying vec3 vPos; varying vec3 vN; varying vec3 vLN; varying vec3 vV;
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float sdRR(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
vec4 nz(vec2 uv){ return texture2D(uNoise, uv); }
vec3 bgBlur(vec2 uv){ vec2 o=vec2(5.)/uRes; vec3 s=texture2D(uBg,uv).rgb*.4;
  s+=texture2D(uBg,uv+vec2(o.x,o.y)).rgb*.15; s+=texture2D(uBg,uv+vec2(-o.x,o.y)).rgb*.15; s+=texture2D(uBg,uv+vec2(o.x,-o.y)).rgb*.15; s+=texture2D(uBg,uv-o).rgb*.15; return s; }
void main(){
  vec3 N=normalize(vN); vec3 V=normalize(-vV);
  vec3 L=normalize(vec3(.42,.72,.55));
  vec2 p=vPos.xy; vec2 uv=p/uSize.xy+.5; vec2 sd=vec2(uSeed*.137, uSeed*.291);
  float face=smoothstep(.55,.92,vLN.z);
  float icicle=step(vPos.y, -uSize.y*.5-1.);
  float d=sdRR(p, uSize.xy*.5, uSize.z);
  float edge=1.-smoothstep(0., 34., -d);
  vec4 A=nz(p/600.+sd), B=nz(p/180.+sd.yx), C=nz(vec2(p.x/90., p.y/600.)+sd*1.7), Dd=nz(p/727.+sd*2.3), E=nz(p/110.+sd);
  float n1=A.r, n2=B.g, n3=C.r;
  float veins=1.-smoothstep(0., .035, Dd.b);
  float crust=smoothstep(.5, 1., edge+(B.r-.5)*1.15+(E.a-.5)*.35)*(.7+.3*E.g);
  vec2 suv=gl_FragCoord.xy/uRes;
  vec2 off=vec2(n2-.5, n1-.5)*.014+normalize(p+1e-3)*edge*.016;
  vec3 bg=bgBlur(suv+off);
  vec3 body=mix(vec3(.58,.74,.87), vec3(.80,.885,.95), smoothstep(-.05, 1.05, uv.y*.85+uv.x*.15));
  body=mix(body, body*.72+bg*.55, .30);
  body+=(n1-.5)*.07+(n3-.5)*.035;
  body+=veins*.035*(1.-edge);
  vec3 col=mix(body, vec3(.93,.965,.99), clamp(crust*.9, 0., 1.));
  float frost=clamp(crust+n1*.3, 0., 1.);
  float sw=fract(uTime*.035*uMotion+uSeed*.137)*2.6-.8;
  float band=exp(-pow((uv.x*.85+uv.y*.55-sw)/.07, 2.))+exp(-pow((uv.x*.85+uv.y*.55-sw-.13)/.025, 2.))*.6;
  col+=band*.11*face;
  vec2 gp=p*.16+uSeed*31.; vec2 g=floor(gp); float hh=hash(g);                 // round glints in the frost, one per 6 px cell at most
  float glint=smoothstep(.42,.0,length(fract(gp)-.5-(vec2(hash(g+3.1),hash(g+7.3))-.5)*.4));
  float tw=step(.965,hh)*glint*pow(.5+.5*sin(uTime*(1.2+hh*2.)*uMotion+hh*70.), 8.)*(.25+frost*.9);
  col+=tw*.75;
  float fres=pow(1.-max(dot(N,V),0.), 2.5);
  float lit=clamp(dot(N,L)*.6+.45, 0., 1.);
  vec3 side=mix(vec3(.36,.55,.70), vec3(.94,.98,1.), lit)+fres*.35;
  side=mix(side, vec3(.93,.97,1.), .35*nz(p/160.+sd).a);
  col=mix(side, col, face);
  col=mix(col, mix(vec3(.62,.80,.92), vec3(.97,.99,1.), lit), icicle);
  float spec=pow(max(dot(N, normalize(L+V)), 0.), 70.)*.9*(1.-face*.6);
  col+=spec;
  col+=uHover*vec3(.04,.06,.08);
  gl_FragColor=vec4(col, 1.);
}`;

// glow + hoar-frost fur behind each card
const HALO_FS = `precision highp float;
uniform vec3 uSize; uniform float uGlow; uniform float uAlpha; uniform float uSeed; uniform sampler2D uNoise;
varying vec3 vPos;
float sdRR(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
void main(){
  vec2 p=vPos.xy; float d=sdRR(p, uSize.xy*.5, uSize.z);
  float glow=exp(-max(d,0.)/22.)*(.10+uGlow*.55)*smoothstep(-6., 4., d);
  float ang=atan(p.y, p.x);
  float spikes=pow(texture2D(uNoise, vec2(ang*1.5+uSeed, length(p)/700.)).a, 3.)*2.4+pow(texture2D(uNoise, p/128.+uSeed).r, 2.)*.6;
  float fur=smoothstep(7., 0., d)*smoothstep(-2., 1., d)*spikes;
  float a=(glow*smoothstep(34., 18., d)+fur*.55)*uAlpha;
  gl_FragColor=vec4(vec3(.80,.90,1.)*a, a);
}`;
const HALO_VS = `uniform float uLayer; varying vec3 vPos; void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  gl_Position.z=(uLayer+.005)*gl_Position.w; }`;

// ---------------------------------------------------------------- frost dust (ambient, back canvas)
const DUST_VS = `attribute vec4 aR; uniform float uTime; uniform float uDpr; uniform vec4 uBox; uniform float uMotion; varying float vA;
// three populations: frost blown off the right of the stack (the concept's spray, as a slow living plume), cold wind
// streaming in from the left, and dust floating around. uBox = stack left, right, half height, centre x (world px)
void main(){
  float t=uTime*uMotion+aR.w*40.;
  vec3 p; float a;
  float kind=aR.x; float mist=0.;
  if(kind<.55){ mist=step(.86, fract(aR.w*7.31));
    float L=2.6+aR.y*2.2; float tau=fract(t/L+aR.z);
    float y0=(aR.y-.5)*uBox.z*1.25;
    p=vec3(uBox.y-50.+tau*(90.+240.*aR.z)+pow(tau,2.)*120., y0*(1.+tau*.9)+tau*(aR.w-.3)*140.+sin(t*1.3+aR.z*9.)*6., (aR.w-.5)*120.);
    a=smoothstep(0.,.06,tau)*(1.-smoothstep(.25,1.,tau))*(.7+.3*aR.w)*(1.-smoothstep(.55,1.,abs(y0)/uBox.z))*mix(2.3, .12, mist);
  } else if(kind<.72){
    float tau=fract(t/(1.3+aR.y)+aR.z);
    p=vec3(uBox.x-760.*(1.-tau)+20., (aR.y-.5)*uBox.z*1.6, (aR.z-.5)*200.);
    a=smoothstep(0.,.3,tau)*(1.-smoothstep(.85,1.,tau))*.45;
  } else {
    p=vec3((aR.y-.5)*1500.+sin(t*.07+aR.z*6.)*30., (aR.z-.5)*uBox.z*5.+sin(t*.3+aR.y*6.28)*14., (aR.w-.6)*500.);
    a=(.25+.45*aR.w)*(.55+.45*sin(t*(1.+aR.w*2.)+aR.x*30.));
  }
  vec4 mv=modelViewMatrix*vec4(p,1.);
  gl_Position=projectionMatrix*mv;
  vA=a;
  gl_PointSize=mix(1.3+pow(aR.w,2.)*(kind<.55?5.:3.4), 26.+aR.y*40., mist)*uDpr*(1100./-mv.z);
}`;
const DUST_FS = `precision highp float; varying float vA;
void main(){ vec2 q=gl_PointCoord-.5; float d=length(q); float a=smoothstep(.5,.0,d); a=a*a; gl_FragColor=vec4(vec3(.85,.93,1.)*a*vA, a*vA); }`;

// ---------------------------------------------------------------- shards (fx canvas)
const SHARD_VS = `attribute vec3 aC; attribute vec4 aR;
uniform mat4 uCard; uniform float uAge; uniform vec2 uImpact; uniform float uDir; uniform vec2 uVel;
varying vec3 vN; varying vec3 vV; varying float vFade; varying vec2 vP; varying float vB;
mat3 rot(vec3 a, float t){ a=normalize(a); float s=sin(t), c=cos(t), o=1.-c;
  return mat3(o*a.x*a.x+c, o*a.x*a.y+a.z*s, o*a.z*a.x-a.y*s, o*a.x*a.y-a.z*s, o*a.y*a.y+c, o*a.y*a.z+a.x*s, o*a.z*a.x+a.y*s, o*a.y*a.z-a.x*s, o*a.z*a.z+c); }
void main(){
  vec2 away=aC.xy-uImpact; float dist=length(away);
  float t=max(uAge-dist/2600., 0.);
  vec3 vel=vec3(away/max(dist,1.)*(150.+380.*aR.x)+vec2(uDir*(480.+760.*aR.z), 90.*(aR.y-.35)), (aR.w-.35)*460.);
  vel.xy+=uVel*.6;
  float dr=1.-exp(-2.2*t);                                   // air drag
  vec3 c=aC+vel*dr/2.2+vec3(0.,-340.*t*t,0.);
  float life=.32+.4*aR.y;
  float s=1.-smoothstep(.05, 1., t/life);
  mat3 R=rot(aR.xyz*2.-1.+.001, (aR.w*2.-1.)*10.*t);
  vec3 p=c+R*(position*s);
  vec4 mv=viewMatrix*uCard*vec4(p,1.);
  vV=mv.xyz; vN=normalize(mat3(viewMatrix*uCard)*(R*normal));
  vFade=s*(1.-smoothstep(.0,.25, t-life+.25)); vP=position.xy; vB=aR.y;
  gl_Position=projectionMatrix*mv;
}`;
const SHARD_FS = `precision highp float; varying vec3 vN; varying vec3 vV; varying float vFade; varying vec2 vP; varying float vB;
void main(){ vec3 N=normalize(vN), V=normalize(-vV); if(dot(N,V)<0.) N=-N; vec3 L=normalize(vec3(.42,.72,.55));
  float fres=pow(1.-max(dot(N,V),0.), 2.); float lit=clamp(dot(N,L)*.6+.45,0.,1.);
  float frost=.5+.5*sin(vP.x*.21+vB*40.)*sin(vP.y*.17-vB*20.);
  vec3 c=mix(vec3(.58,.76,.90), vec3(.95,.98,1.), lit*.55+fres*.6+frost*.25+vB*.15)+pow(max(dot(N,normalize(L+V)),0.),40.)*.9;
  float a=(.30+fres*.5)*vFade; gl_FragColor=vec4(c*a, a); }`;

// ---------------------------------------------------------------- particles: frost burst + mist (fx canvas)
const BURST_VS = `attribute vec3 aV; attribute vec4 aR;
uniform mat4 uCard; uniform float uAge; uniform float uDir; uniform float uDpr; uniform vec2 uVel;
varying float vA; varying float vMist;
void main(){
  float mist=step(.955, aR.w);
  float t=max(uAge-aR.z*.12, 0.);
  float k=mix(2.4, 1.3, mist);
  vec3 v=aV; v.x+=uDir*mix(360., 220., mist)*(.4+aR.x); v.xy+=uVel*.5;
  vec3 p=position+v*(1.-exp(-k*t))/k + vec3(sin(t*3.+aR.y*20.)*8., -60.*t*t*(1.-mist)+mist*20.*t, 0.);
  vec4 mv=viewMatrix*uCard*vec4(p,1.);
  gl_Position=projectionMatrix*mv;
  float life=mix(.7+aR.x*.9, 1.2+aR.y*.6, mist);
  vA=(1.-smoothstep(.0, life, t))*step(0., uAge-aR.z*.12)*mix(1., .3, mist);
  vMist=mist;
  float sz=mix(2.+aR.y*5.2, 22.+aR.x*30., mist)*(1.+mist*t*1.2);
  gl_PointSize=sz*uDpr*(1100./-mv.z);
}`;
const BURST_FS = `precision highp float; varying float vA; varying float vMist;
void main(){ vec2 q=gl_PointCoord-.5; float d=length(q)*2.;
  float core=smoothstep(1.,.0,d); float a=mix(pow(core,1.6), pow(core,2.5), vMist)*vA;
  vec3 c=mix(vec3(.88,.95,1.), vec3(.70,.84,.97), vMist); gl_FragColor=vec4(c*a, a); }`;

// speed streaks behind an arriving card
const STREAK_VS = `attribute vec4 aR; uniform mat4 uCard; uniform vec3 uSize; uniform float uSpeed; uniform float uTime;
varying float vA; varying float vU;
void main(){
  float len=(80.+aR.x*320.)*uSpeed; float y=(aR.y-.5)*uSize.y*1.1; float th=1.+aR.z*2.6;
  float x0=-uSize.x*.5+8.-aR.w*40.*uSpeed;
  vec2 q=vec2(x0-len*(1.-position.x), y+(position.y-.5)*th);
  vU=position.x; vA=uSpeed*(.25+.6*aR.z);
  gl_Position=projectionMatrix*viewMatrix*uCard*vec4(q, -2.-aR.w*10., 1.);
}`;
const STREAK_FS = `precision highp float; varying float vA; varying float vU;
void main(){ float a=vA*pow(vU,1.6)*(1.-smoothstep(.92,1.,vU)*.4); gl_FragColor=vec4(vec3(.82,.92,1.)*a, a); }`;

// ---------------------------------------------------------------- geometry helpers
function roundedShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function slabGeometry(W, H, R, D, variant) {
  const bevel = Math.max(2.5, D * 0.42);
  const g = new THREE.ExtrudeGeometry(roundedShape(W - bevel * 2, H - bevel * 2, Math.max(R - bevel, 2)),
    { depth: D, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 10 });
  g.translate(0, 0, -D - bevel);                                  // the front face sits on the card plane (z = 0)
  let geo = g.index ? g.toNonIndexed() : g;
  // icicles under the bottom edge
  const rnd = rng(17 + variant * 101), parts = [geo];
  const count = 4 + Math.floor(rnd() * 4);
  for (let i = 0; i < count; i++) {
    const len = 6 + Math.pow(rnd(), 1.6) * 24, rad = 1.6 + rnd() * 2.6;
    const c = new THREE.ConeGeometry(rad, len, 7, 1, true).toNonIndexed();
    c.rotateX(Math.PI); // tip down
    const x = (rnd() - 0.5) * (W - R * 2.4), z = -D * (0.2 + rnd() * 0.6);
    c.translate(x, -H / 2 - len / 2 + 1.5, z); parts.push(c);
  }
  return merge(parts);
}
function merge(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.computeBoundingSphere(); return m;
}

// Voronoi fracture of the rounded card into convex shards, extruded to the slab's depth
function fractureGeometry(W, H, R, D, impact, seed) {
  const rnd = rng(seed);
  const outline = [];                                             // the rounded rectangle as a convex polygon
  const corners = [[W / 2 - R, H / 2 - R, 0], [-W / 2 + R, H / 2 - R, Math.PI / 2], [-W / 2 + R, -H / 2 + R, Math.PI], [W / 2 - R, -H / 2 + R, Math.PI * 1.5]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= 5; i++) { const a = a0 + (i / 5) * Math.PI / 2; outline.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
  const sites = [];
  for (let i = 0; i < 84; i++) {
    if (i < 58) { const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 1.5) * W * 0.55; sites.push([impact[0] + Math.cos(a) * r, impact[1] + Math.sin(a) * r * 0.6]); }
    else sites.push([(rnd() - 0.5) * W, (rnd() - 0.5) * H]);
  }
  const clip = (poly, a, b) => {                                // keep the half-plane closer to a than b
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, nx = b[0] - a[0], ny = b[1] - a[1];
    const side = (p) => (p[0] - mx) * nx + (p[1] - my) * ny; const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], sp = side(p), sq = side(q);
      if (sp <= 0) out.push(p);
      if ((sp <= 0) !== (sq <= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    return out;
  };
  const P = [], Nn = [], C = [], Rr = [];
  for (let i = 0; i < sites.length; i++) {
    let poly = outline.map((p) => p.slice());
    for (let j = 0; j < sites.length && poly.length >= 3; j++) if (j !== i) poly = clip(poly, sites[i], sites[j]);
    if (poly.length < 3) continue;
    let cx = 0, cy = 0; for (const p of poly) { cx += p[0]; cy += p[1]; } cx /= poly.length; cy /= poly.length;
    const r4 = [rnd(), rnd(), rnd(), rnd()], cz = -D / 2;
    const push = (x, y, z, nx, ny, nz) => { P.push(x - cx, y - cy, z - cz); Nn.push(nx, ny, nz); C.push(cx, cy, cz); Rr.push(...r4); };
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      push(cx, cy, 0, 0, 0, 1); push(a[0], a[1], 0, 0, 0, 1); push(b[0], b[1], 0, 0, 0, 1);           // front
      push(cx, cy, -D, 0, 0, -1); push(b[0], b[1], -D, 0, 0, -1); push(a[0], a[1], -D, 0, 0, -1);   // back
      const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1, nx = ey / l, ny = -ex / l; // side
      push(a[0], a[1], 0, nx, ny, 0); push(a[0], a[1], -D, nx, ny, 0); push(b[0], b[1], 0, nx, ny, 0);
      push(b[0], b[1], 0, nx, ny, 0); push(a[0], a[1], -D, nx, ny, 0); push(b[0], b[1], -D, nx, ny, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setAttribute('aC', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aR', new THREE.Float32BufferAttribute(Rr, 4));
  return g;
}

function burstGeometry(W, H, n, seed) {
  const rnd = rng(seed), P = new Float32Array(n * 3), V = new Float32Array(n * 3), R = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const edge = rnd() < 0.45;                                   // many from the rim, where the frost is thickest
    let x = (rnd() - 0.5) * W, y = (rnd() - 0.5) * H;
    if (edge) { if (rnd() < 0.5) y = Math.sign(y || 1) * H / 2 * (0.85 + rnd() * 0.2); else x = Math.sign(x || 1) * W / 2 * (0.85 + rnd() * 0.2); }
    P.set([x, y, -rnd() * 8], i * 3);
    const a = rnd() * Math.PI * 2, s = 40 + Math.pow(rnd(), 2) * 320;
    V.set([Math.cos(a) * s, Math.sin(a) * s * 0.7 + 30, (rnd() - 0.3) * 260], i * 3);
    R.set([rnd(), rnd(), rnd(), rnd()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aV', new THREE.BufferAttribute(V, 3)); g.setAttribute('aR', new THREE.BufferAttribute(R, 4));
  return g;
}

// ---------------------------------------------------------------- the engine
export function createIce({ back, fx, motion = 1 }) {
  let renderer, fxr;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: back, antialias: true, alpha: false, powerPreference: 'high-performance' });
    fxr = new THREE.WebGLRenderer({ canvas: fx, antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  } catch (e) { return null; }
  if (!renderer.getContext() || !fxr.getContext()) return null;
  renderer.setClearColor(0x03112c, 1); fxr.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  const camera = new THREE.PerspectiveCamera(30, 1, 10, 6000);
  const scene = new THREE.Scene(), fxScene = new THREE.Scene();
  const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));

  // background pass → half-resolution target
  const bgRT = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const bgU = { uRes: { value: new THREE.Vector2(4, 4) }, uView: { value: new THREE.Vector2(1, 1) }, uAnchor: { value: new THREE.Vector2() },
    uStack: { value: new THREE.Vector2(420, 300) }, uTime: { value: 0 }, uStreak: { value: 0 } };
  const bgScene = new THREE.Scene();
  const bgMesh = new THREE.Mesh(tri, new THREE.ShaderMaterial({ vertexShader: SCREEN_VS, fragmentShader: BG_FS, uniforms: bgU, depthTest: false, depthWrite: false }));
  bgMesh.frustumCulled = false; bgScene.add(bgMesh);
  const compose = new THREE.Mesh(tri, new THREE.ShaderMaterial({ vertexShader: SCREEN_VS, fragmentShader: COMPOSE_FS,
    uniforms: { uBg: { value: bgRT.texture }, uTime: { value: 0 } }, depthTest: false, depthWrite: false }));
  compose.frustumCulled = false; compose.renderOrder = -100; scene.add(compose);

  const shared = { uBg: { value: bgRT.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uMotion: { value: motion }, uDpr: { value: 1 } };
  // painter's order (back to front by renderOrder), no depth: the slabs are convex and back faces are culled, so each one
  // draws cleanly, and a newer card always covers an older one even where their tilted planes cross
  const sizeU = { value: new THREE.Vector3(420, 150, 18) };
  const noiseRT = new THREE.WebGLRenderTarget(512, 512, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, depthBuffer: false });
  { const bs = new THREE.Scene(), m = new THREE.Mesh(tri, new THREE.ShaderMaterial({ vertexShader: SCREEN_VS, fragmentShader: BAKE_FS, depthTest: false, depthWrite: false }));
    m.frustumCulled = false; bs.add(m); renderer.setRenderTarget(noiseRT); renderer.render(bs, camera); renderer.setRenderTarget(null); m.material.dispose(); }
  const uNoise = { value: noiseRT.texture };
  const slabMaterial = (seed) => new THREE.ShaderMaterial({ vertexShader: SLAB_VS, fragmentShader: SLAB_FS, transparent: false, depthTest: true, depthWrite: true,
    uniforms: { uBg: shared.uBg, uNoise, uRes: shared.uRes, uTime: shared.uTime, uMotion: shared.uMotion, uSize: sizeU, uSeed: { value: seed }, uHover: { value: 0 }, uLayer: { value: 0 } } });
  const haloMaterial = (seed) => new THREE.ShaderMaterial({ vertexShader: HALO_VS, fragmentShader: HALO_FS, transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uNoise, uSize: sizeU, uGlow: { value: 0 }, uAlpha: { value: 1 }, uSeed: { value: seed }, uLayer: { value: 0 } } });

  let W = 420, H = 150, R = 18, D = 12, slabGeos = [], haloGeo = null;
  let shardGeos = [], burstGeo = null;
  const cards = new Map(), cardPool = [];                                        // id → { slab, halo, seed, variant }

  function buildGeometry() {
    for (const g of slabGeos) g.dispose(); for (const g of shardGeos) g.dispose(); haloGeo?.dispose(); burstGeo?.dispose();
    slabGeos = [0, 1, 2].map((v) => slabGeometry(W, H, R, D, v));
    haloGeo = new THREE.PlaneGeometry(W + 70, H + 70);
    shardGeos = [[W * 0.42, 0], [-W * 0.42, 0], [W * 0.36, H * 0.3]].map((imp, i) => fractureGeometry(W, H, R, D, imp, 7 + i * 13));
    burstGeo = burstGeometry(W, H, 3400, 99);
    for (const c of [...cards.values(), ...cardPool]) { c.slab.geometry = slabGeos[c.variant || 0]; c.halo.geometry = haloGeo; }
    for (const s of shardPool) s.mesh.geometry = shardGeos[s.variant];
    for (const b of burstPool) b.points.geometry = burstGeo;
    for (const s of streaks.values()) s.mesh.material.uniforms.uSize.value.set(W, H, R);
    sizeU.value.set(W, H, R);
  }

  // ambient frost dust
  const dustN = 1800, dP = new Float32Array(dustN * 3), dR = new Float32Array(dustN * 4); const dr = rng(5);
  for (let i = 0; i < dustN; i++) { dP.set([(dr() - 0.5) * 1400, (dr() - 0.5) * 560 * (0.4 + dr() * 0.8), (dr() - 0.6) * 500], i * 3); dR.set([dr(), dr(), dr(), dr()], i * 4); }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dP, 3)); dustGeo.setAttribute('aR', new THREE.BufferAttribute(dR, 4));
  const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({ vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uTime: shared.uTime, uDpr: shared.uDpr, uMotion: shared.uMotion, uBox: { value: new THREE.Vector4(-400, 300, 120, 0) } } }));
  dust.frustumCulled = false; dust.renderOrder = 1000; scene.add(dust);

  // pools for the fx canvas
  const premul = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor };
  const shardPool = [], burstPool = [], streaks = new Map();
  for (let i = 0; i < 12; i++) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ vertexShader: SHARD_VS, fragmentShader: SHARD_FS, side: THREE.DoubleSide, ...premul,
      uniforms: { uCard: { value: new THREE.Matrix4() }, uAge: { value: 0 }, uImpact: { value: new THREE.Vector2() }, uDir: { value: 1 }, uVel: { value: new THREE.Vector2() } } }));
    mesh.frustumCulled = false; mesh.visible = false; fxScene.add(mesh); shardPool.push({ mesh, variant: 0, t0: 0, on: false });
    const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ vertexShader: BURST_VS, fragmentShader: BURST_FS, ...premul,
      uniforms: { uCard: mesh.material.uniforms.uCard, uAge: { value: 0 }, uDir: mesh.material.uniforms.uDir, uDpr: shared.uDpr, uVel: mesh.material.uniforms.uVel } }));
    points.frustumCulled = false; points.visible = false; points.renderOrder = 10; fxScene.add(points); burstPool.push({ points, t0: 0, on: false });
  }
  const streakGeo = (() => {                                     // 46 unit quads, each with its own random
    const n = 46, P = [], Rr = [], r = rng(3);
    for (let i = 0; i < n; i++) { const a = [r(), r(), r(), r()];
      for (const [x, y] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) { P.push(x, y, 0); Rr.push(...a); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aR', new THREE.Float32BufferAttribute(Rr, 4)); return g;
  })();

  let vw = 1, vh = 1, dpr = 1, P = 1400, ax = 0, ay = 0;

  const api = {
    renderer, camera,
    setSize(w, h, pixelRatio) {
      vw = w; vh = h; dpr = pixelRatio;
      renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); fxr.setPixelRatio(dpr); fxr.setSize(w, h, false);
      bgRT.setSize(Math.max(2, Math.round(w * dpr * 0.36)), Math.max(2, Math.round(h * dpr * 0.36)));
      bgU.uRes.value.set(bgRT.width, bgRT.height); bgU.uView.value.set(w, h);
      shared.uRes.value.set(Math.round(w * dpr), Math.round(h * dpr)); shared.uDpr.value = dpr;
      api.setView(ax, ay, P);
    },
    // perspective P (CSS px) with its origin at (x, y) in canvas CSS px: the camera now matches the CSS 3D layer exactly
    setView(x, y, persp) {
      ax = x; ay = y; P = persp;
      const fullW = 2 * Math.max(x, vw - x), fullH = 2 * Math.max(y, vh - y);
      camera.fov = 2 * Math.atan(fullH / 2 / P) * 180 / Math.PI; camera.aspect = fullW / fullH; camera.near = 10; camera.far = P + 3000;
      camera.position.set(0, 0, P); camera.lookAt(0, 0, 0);
      camera.setViewOffset(fullW, fullH, fullW / 2 - x, fullH / 2 - y, vw, vh);
      camera.updateProjectionMatrix();
      bgU.uAnchor.value.set(x, y);
    },
    setCardSize(w, h, r, d) {
      if (w === W && h === H && r === R && d === D && slabGeos.length) return;
      W = w; H = h; R = r; D = d; buildGeometry();
    },
    setStackExtent(w, h, box) { bgU.uStack.value.set(w, h); if (box) dust.material.uniforms.uBox.value.set(...box); },
    // slabs come from a pool: a card that leaves hands its mesh + materials to the next one (no material churn mid-animation)
    add(id, seed) {
      const variant = seed % 3, sd = (seed * 0.6180339) % 1 * 10;
      let c = cardPool.pop();
      if (!c) {
        const slab = new THREE.Mesh(slabGeos[variant], slabMaterial(sd)); slab.matrixAutoUpdate = false;
        const halo = new THREE.Mesh(haloGeo, haloMaterial(sd)); halo.matrixAutoUpdate = false;
        slab.frustumCulled = false; halo.frustumCulled = false; scene.add(halo); scene.add(slab);
        c = { slab, halo };
      }
      c.variant = variant; c.slab.geometry = slabGeos[variant]; c.halo.geometry = haloGeo;
      c.slab.material.uniforms.uSeed.value = sd; c.halo.material.uniforms.uSeed.value = sd;
      c.slab.visible = c.halo.visible = true;
      cards.set(id, c);
    },
    // m: THREE.Matrix4 (world, y up); k: depth rank (0 = front); glow 0..1; hover 0..1; alpha 0..1
    update(id, m, k, glow, hover, alpha) {
      const c = cards.get(id); if (!c) return;
      c.slab.matrix.copy(m); c.halo.matrix.copy(m).multiply(HALO_BACK); c.slab.matrixWorldNeedsUpdate = true; c.halo.matrixWorldNeedsUpdate = true;
      const layer = -0.95 + (k + 1) * 0.012;
      c.slab.renderOrder = k; c.halo.renderOrder = 500 + k;
      c.slab.material.uniforms.uLayer.value = layer; c.halo.material.uniforms.uLayer.value = layer;
      c.slab.material.uniforms.uHover.value = hover;
      c.halo.material.uniforms.uGlow.value = glow; c.halo.material.uniforms.uAlpha.value = alpha;
    },
    prewarm(n) { for (let i = 0; i < n; i++) api.add(-1 - i, i); for (let i = 0; i < n; i++) api.remove(-1 - i); },
    remove(id) { const c = cards.get(id); if (!c) return; c.slab.visible = c.halo.visible = false; cards.delete(id); cardPool.push(c); },
    // dir ±1; impact in card-local px (y up); vel px/s (world)
    shatter(m, dir, impact, vel, now) {
      const variant = Math.abs(impact[1]) > H * 0.2 ? 2 : impact[0] >= 0 ? 0 : 1;
      let i = shardPool.findIndex((p) => !p.on); if (i < 0) i = 0;
      const s = shardPool[i], b = burstPool[i];                       // pairs share their uniforms (made together)
      s.on = true; s.t0 = now; s.variant = variant; s.mesh.geometry = shardGeos[variant]; s.mesh.visible = true;
      const u = s.mesh.material.uniforms; u.uCard.value.copy(m); u.uImpact.value.set(impact[0], impact[1]); u.uDir.value = dir; u.uVel.value.set(vel[0], vel[1]); u.uAge.value = 0;
      b.on = true; b.t0 = now; b.points.visible = true; b.points.material.uniforms.uAge.value = 0;
    },
    streak(id, m, speed) {
      let s = streaks.get(id);
      if (!s) {
        if (speed < 0.02) return;
        const mesh = new THREE.Mesh(streakGeo, new THREE.ShaderMaterial({ vertexShader: STREAK_VS, fragmentShader: STREAK_FS, ...premul,
          uniforms: { uCard: { value: new THREE.Matrix4() }, uSize: { value: new THREE.Vector3(W, H, R) }, uSpeed: { value: 0 }, uTime: shared.uTime } }));
        mesh.frustumCulled = false; fxScene.add(mesh); s = { mesh }; streaks.set(id, s);
      }
      s.mesh.material.uniforms.uCard.value.copy(m); s.mesh.material.uniforms.uSpeed.value = speed;
      if (speed < 0.02) { fxScene.remove(s.mesh); s.mesh.material.dispose(); streaks.delete(id); }
      bgU.uStreak.value = Math.max(bgU.uStreak.value, speed * 0.6);
    },
    fxActive() { return shardPool.some((p) => p.on) || burstPool.some((p) => p.on) || streaks.size > 0; },
    render(now, timeS) {
      shared.uTime.value = timeS; bgU.uTime.value = timeS; compose.material.uniforms.uTime.value = timeS;
      bgU.uStreak.value *= 0.94;
      if ((api._bgTick = (api._bgTick || 0) + 1) % 2 || bgU.uStreak.value > 0.02) { renderer.setRenderTarget(bgRT); renderer.render(bgScene, camera); }
      renderer.setRenderTarget(null); renderer.clear(); renderer.render(scene, camera);
      let fxOn = false;
      for (const s of shardPool) if (s.on) { const age = (now - s.t0) / 1000; s.mesh.material.uniforms.uAge.value = age; if (age > 1.9) { s.on = false; s.mesh.visible = false; } else fxOn = true; }
      for (const b of burstPool) if (b.on) { const age = (now - b.t0) / 1000; b.points.material.uniforms.uAge.value = age; if (age > 2.3) { b.on = false; b.points.visible = false; } else fxOn = true; }
      if (streaks.size) fxOn = true;
      if (fxOn || api._fxDirty) { fxr.render(fxScene, camera); api._fxDirty = fxOn; }
    },
    compile() {
      const hidden = []; fxScene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
      const probe = new THREE.Mesh(streakGeo, new THREE.ShaderMaterial({ vertexShader: STREAK_VS, fragmentShader: STREAK_FS, ...premul,
        uniforms: { uCard: { value: new THREE.Matrix4() }, uSize: { value: new THREE.Vector3(W, H, R) }, uSpeed: { value: 0 }, uTime: shared.uTime } }));
      probe.frustumCulled = false; fxScene.add(probe);
      renderer.compile(scene, camera); fxr.compile(fxScene, camera);
      fxr.render(fxScene, camera); fxr.clear();                      // upload the pooled geometry now, not on the first shatter
      fxScene.remove(probe); probe.material.dispose(); for (const o of hidden) o.visible = false;
    },
    setMotion(v) { shared.uMotion.value = v; },
    dispose() { renderer.dispose(); fxr.dispose(); },
  };
  const HALO_BACK = new THREE.Matrix4().makeTranslation(0, 0, -D - 8);
  return api;
}
