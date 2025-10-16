import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

import * as TWEEN from "three/addons/libs/tween.module.js";

console.clear();
const mu = THREE.MathUtils;
const simplex = new SimplexNoise();

THREE.ShaderChunk['transmission_fragment'] = THREE.ShaderChunk['transmission_fragment'].replace(
  `material.attenuationColor = attenuationColor;`,
  `material.attenuationColor = diffuseColor.rgb;`
);
// load fonts
await (async function () {
  async function loadFont(fontface) {
    await fontface.load();
    document.fonts.add(fontface);
  }
  let fonts = [
    new FontFace(
      "LibreBarcode128Text",
      "url(https://fonts.gstatic.com/s/librebarcode128text/v29/fdNv9tubt3ZEnz1Gu3I4-zppwZ9CWZ16Z0w5QVrS6Q.woff2) format('woff2')"
    )
  ];
  for (let font of fonts) {
    await loadFont(font);
  }
})();

let Umodel = (await new GLTFLoader().loadAsync("https://cywarr.github.io/small-shop/UTbeta/U.glb")).scene.children[0].children[0];

class UModel extends THREE.Object3D{
  constructor(){
    super();
    const modelScale = 0.04;
    Umodel.geometry.rotateY(Math.PI);
    Umodel.geometry.computeVertexNormals();
    Umodel.geometry.scale(modelScale, modelScale, modelScale);
    Umodel.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#E57505").offsetHSL(0, 0, 0.15),
      roughness: 0.2,
      metalness: 1.0,
    });
    Umodel.position.y = 3.5;
    this.model = Umodel;
    this.add(Umodel);
  }
  
  update(t){
    this.model.rotation.y = -t;
  }
}

class BottleGeometry extends THREE.BufferGeometry{
  constructor(){
    const totalHeight = 7;
    const radius = 1;
    const lidHeight = totalHeight * (2 / 3);
    const topHeight = totalHeight * (1 / 3);
    const gapHeight = 0.05;
    
    super().copy(mergeGeometries([
      new THREE.CylinderGeometry(radius, radius, lidHeight, 3, 1).translate(0, lidHeight * 0.5, 0),
      new THREE.CylinderGeometry(radius * 0.75, radius * 0.75, gapHeight, 3, 1).translate(0, lidHeight + gapHeight * 0.5, 0),
      new THREE.CylinderGeometry(radius, radius, topHeight, 3, 1).translate(0, totalHeight - (topHeight * 0.5) + gapHeight, 0)
    ])).rotateY(-Math.PI * 0.5);
  }
}

class Bottle extends THREE.InstancedMesh{
  constructor(){
    const fragrances = [
      {name: "Games", color: 220, description: "Explore our collection of games and entertainment.<br><br>Play various games including Minecraft, Chess, UNO, and more.", url: "bss.html"},
      {name: "Resources", color: 160, description: "Access our library of resources and files.<br><br>Find proxies, usernames, and other useful tools.", url: "resources.html"},
      {name: "Tools", color: 40, description: "Check out our utilities and tools section.<br><br>Generate robux and access various helpful utilities.", url: "2.html"},
      {name: "Fun", color: 340, description: "Discover our fun and interactive content.<br><br>Explore fake Roblox and other entertaining experiences.", url: "roadblocks.html"}
    ];

    const g = new BottleGeometry();
    const m = new THREE.MeshPhysicalMaterial({
      //wireframe: true,
      forceSinglePass: true,
      side: THREE.DoubleSide,
      
      metalness: 0.00,
      roughness: 0.75,
      
      ior: 1.75,
      thickness: 4,
      transmission: 1,
      dispersion: 5,
      
      attenuationDistance: 3,
      
      onBeforeCompile: shader => {
        shader.uniforms.time = gu.time;
        shader.uniforms.texNames = {value: (() => {
          const c = document.createElement("canvas");
          c.width = 1024;
          c.height = 2048;
          let u = val => val * (c.height / fragrances.length) * 0.01; 
          const ctx = c.getContext("2d");

          ctx.fillStyle = "#fff";
          ctx.font = `${u(90)}px LibreBarcode128Text`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          fragrances.forEach((f, fIdx) => {
            ctx.fillText(f.name, c.width * 0.5, c.height - (0.5 + fIdx) * u(100));
          })

          const tex = new THREE.CanvasTexture(c);
          tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          
          return tex;
        })()};
        shader.vertexShader = `
          varying vec3 vPos;
          varying vec2 vUv;
          varying float vIID;
         
          ${shader.vertexShader}
        `.replace(
          `#include <begin_vertex>`,
          `#include <begin_vertex>
            vPos = position;
            vUv = uv;
            vIID = float(gl_InstanceID);
          `
        );
        shader.fragmentShader = `
          uniform float time;
          uniform sampler2D texNames;
          varying vec3 vPos;
          varying vec2 vUv;
          varying float vIID;
          
          vec3 toLuminance(vec3 col, float destinationLuminance){
            float currentLuminance = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
            float multiplier = destinationLuminance / currentLuminance;
            return col * multiplier;
          }
                    
          ${noise}
          
          ${shader.fragmentShader}
        `.replace(
          `#include <roughnessmap_fragment>`,
          `#include <roughnessmap_fragment>
          
            float t = time * 0.5;
            
            float iID = floor(vIID + 0.1);
            
            float ffVal = gl_FrontFacing == true ? 1. : 0.;
            
            // lid
            float lidHeight = 7. * 2. / 3.;
            float fHeight = smoothstep(lidHeight - 0.5, lidHeight + 0.5, vPos.y);
            roughnessFactor *= fHeight;
            
            // bottom fume
            float bfNoise = snoise(vec4(vPos - vec3(0, t + iID * 100., 0), t));
            bfNoise = pow(abs(bfNoise), 0.875);
            bfNoise = 1. - bfNoise;
            bfNoise *= 1. - smoothstep(0., 3.5, vPos.y);
            roughnessFactor = max(roughnessFactor, bfNoise * roughness);
            
            
            vec2 nameUV = vec2(
              (vUv.x - 0.5) * 3. + 0.5, 
              (3.5 - vPos.y) * -3.5 * 0.5 + 0.5
            );
            
            
            float hStep = 0.25;
            
            vec2 finalUV = vec2(nameUV.x, (iID + nameUV.y) * 0.25);
            float nameF = texture(texNames, finalUV).g;
            
            vec2 absNameUV = abs(nameUV - 0.5);
            float limitF = 1. - step(0.5, max(absNameUV.x, absNameUV.y));
            
            float nameFullF = nameF * limitF;
            
            roughnessFactor = max(roughnessFactor, nameFullF * ffVal);
          
          `
        ).replace(
          `#include <metalnessmap_fragment>`,
          `#include <metalnessmap_fragment>
          
            metalnessFactor = max(metalnessFactor, nameFullF * ffVal);
          `
        ).replace(
          `#include <emissivemap_fragment>`,
          `#include <emissivemap_fragment>
          vec3 emissiveBase = mix(toLuminance(diffuseColor.rgb, 0.5), toLuminance(diffuseColor.rgb, 0.75), smoothstep(0.1, 0.2, pow(bfNoise, 2.)));
          vec3 emissiveColorVal = mix(emissiveBase, vec3(1), nameFullF) * ffVal;
          float emissiveVal = max(nameFullF, bfNoise);
          totalEmissiveRadiance = emissiveColorVal * emissiveVal;
          `
        );
      }
    });
    
    super(g, m, fragrances.length);
    
    this.fragrances = fragrances;
    
    this.proxy = [];
    this.rotationSpeed = 1;
    this.proxyDistance = 3.5;
    this.totalTime = 0;
    this.floating = 0;
    
    for(let i = 0; i < fragrances.length; i++){
      const dummy = new THREE.Object3D();
      dummy.updateMatrix();
      this.setMatrixAt(i, dummy.matrix);
      this.setColorAt(i, new THREE.Color().setHSL(fragrances[i].color / 360, 0.9875, 0.5));
      this.proxy.push(dummy);
    }
    
  }
  
  update(time){
    this.totalTime += time * this.rotationSpeed;
    this.floating += time * 0.5;
    const t = this.totalTime;
    const angleStep = (Math.PI * 2) / this.proxy.length;
    this.proxy.forEach((proxy, pIdx) => {
      const a = (angleStep * pIdx) - Math.PI * 0.1 * t;
      proxy.position.set(Math.cos(a) * this.proxyDistance, 0, Math.sin(a) * this.proxyDistance);
      const n = simplex.noise(pIdx, this.floating);
      proxy.position.y = n * 0.5;
      
      proxy.rotation.y = -a;
      proxy.updateMatrix();
      this.setMatrixAt(pIdx, proxy.matrix);
    });
    this.instanceMatrix.needsUpdate = true;
  }
}

class BottleController {
  constructor(bottle, controls){
    this.bottle = bottle;
    this.controls = controls;
    
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.intersects = [];
    
    this.minDistance = 7;
    this.maxDistance = 12;
    
    this.fadeOutDir = new THREE.Vector3();
    this.currentURL = null;
    
    window.addEventListener("dblclick", event => {
      this.fadeIn();
    });
    
    btnClose.addEventListener("click", event => {
      this.fadeOut();
    });
    
    btnProceed.addEventListener("click", event => {
      if (this.currentURL) {
        window.location.href = this.currentURL;
      }
    });
    
  }
  
  fadeIn(){
    this.pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
	    this.pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, camera);
      this.intersects = this.raycaster.intersectObject(this.bottle);
      if (this.intersects.length != 0){

        this.bottle.rotationSpeed = 0;
        this.controlsOn(false);
        
        const obj = this.intersects[0];
        const iID = obj.instanceId;
        
        // Store the URL for the Proceed button
        this.currentURL = bottle.fragrances[iID].url;
        
        container.style.opacity = 0;
        container.style.display = "block";
        
        const description = bottle.fragrances[iID].description;
        text.innerHTML = description;
        
        const currentDistance = this.controls.getDistance();
        
        const objPos = bottle.proxy[iID].position.clone().setY(0).normalize();
        this.fadeOutDir.copy(objPos);
        const camPos = this.controls.object.position.clone().setY(0).normalize();
        const angle = objPos.angleTo(camPos);
        const normal = objPos.cross(camPos).normalize().negate();
        
        const duration = angle / (Math.PI * 0.5);
        
        const tweenCamera = new TWEEN.Tween({val: 0}).to({val: 1}, duration * 1000)
          .easing(TWEEN.Easing.Cubic.InOut)
          .onUpdate(val => {
            const dist = mu.lerp(currentDistance, this.minDistance, val.val);
            this.controls.object.position.copy( camPos )
              .applyAxisAngle( normal, angle * val.val )
              .setLength( dist )
              .add( this.controls.target );
            this.controls.object.lookAt(this.controls.target);
          });
        
        const tweenShow = new TWEEN.Tween({val: 0}).to({val: 1}, 250)
          .easing(TWEEN.Easing.Cubic.InOut)
          .onUpdate(val => {container.style.opacity = val.val});
        
        tweenCamera.chain(tweenShow);
        tweenCamera.start();
      }
  }
  
  fadeOut(){
    const dir = new THREE.Vector3()
        .subVectors(
          this.controls.object.position.clone().setY(0).normalize(), 
          this.controls.target.clone().setY(0).normalize()
        ).normalize();
      new TWEEN.Tween({val: 0}).to({val: 1}, 1000)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onUpdate(val => {
          container.style.opacity = 1. - val.val;
          this.controls.object.position.copy(this.fadeOutDir).setLength(mu.lerp(this.minDistance, this.maxDistance, val.val)).add(this.controls.target);
          this.bottle.rotationSpeed = val.val;
        })
        .onComplete(() => {
          container.style.display = 'none'; 
          this.controlsOn(true);
          //this.controls.autoRotate = true;
        })
        .start();
  }
  
  controlsOn(onoff){
    this.controls.enableZoom = onoff;
    this.controls.enableDamping = onoff;
    this.controls.enableRotate = onoff;
  }
}

const gu = {
  time: {
    value: 0
  },
  aspect: {
    value: innerWidth / innerHeight
  }
};
const dpr = Math.min(devicePixelRatio, 1);
const scene = new THREE.Scene();
scene.background = new THREE.Color("gray");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 1).setLength(12);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth * dpr, innerHeight * dpr);
document.body.appendChild(renderer.domElement);

const btnClose = document.getElementById('btnClose');
const container = document.getElementById('container');
const text = document.getElementById('text');
const btnProceed = document.getElementById('btnProceed');

window.addEventListener("resize", (event) => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth * dpr, innerHeight * dpr);
  gu.aspect.value = camera.aspect;
});

let camShift = new THREE.Vector3(0, 3.5, 0);
let controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.add(camShift);
controls.object.position.add(camShift);
controls.minPolarAngle = controls.maxPolarAngle = Math.PI * 0.5;
controls.minDistance = 7;
controls.maxDistance = 12;
controls.enablePan = false;

const light = new THREE.DirectionalLight(0xffffff, Math.PI * 1.75);
light.position.set(0.5, 1, 1).setLength(50);
scene.add(light, new THREE.AmbientLight(0xffffff, Math.PI * 0.25));

const pmremGenerator = new THREE.PMREMGenerator( renderer );
const roomEnv = new RoomEnvironment();
const envMap = pmremGenerator.fromScene( roomEnv, 0.04 ).texture;
scene.environment = envMap; 
scene.background = envMap;

// Stuff

const uModel = new UModel();
uModel.model.material.envMap = envMap;
scene.add(uModel);

const bottle = new Bottle();
scene.add(bottle);

const bottleController = new BottleController(bottle, controls);

////////

const clock = new THREE.Clock();
let t = 0;

renderer.setAnimationLoop(() => {
  let dt = Math.min(clock.getDelta(), 1/30);
  t += dt;
  gu.time.value = t;
  TWEEN.update();
  controls.update();
  
  
  uModel.update(t * 0.5);
  bottle.update(dt * 0.25);
  
  renderer.render(scene, camera);
})
