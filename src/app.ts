import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as CANNON from 'cannon-es';
import { color, positionGeometry, texture } from "three/tsl";
import { BokehShader } from "three/examples/jsm/Addons.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

class ThreeJSContainer {
    private scene!: THREE.Scene;
    private world!: CANNON.World;

    // 物理演算するものまとめ
    private physicsObjects: {
        mesh: THREE.Object3D;
        body: CANNON.Body;
    }[] = [];
    constructor() {

    }
    // 画面部分の作成(表示する枠ごとに)*
    public createRendererDOM = async (width: number, height: number, cameraPos: THREE.Vector3) => {
        let previousTime: number | null = null;
        let elapsedTime = 0;
        const startDelay = 0.5;
        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(width, height);
        renderer.setClearColor(new THREE.Color(0xeeeeee));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;

        //カメラの設定
        const camera = new THREE.PerspectiveCamera(95, width / height, 0.1, 1000);
        camera.position.copy(cameraPos);
        camera.lookAt(new THREE.Vector3(-1, 5, 0));

        // const orbitControls = new OrbitControls(camera, renderer.domElement);

        await this.createScene();
        renderer.compile(this.scene, camera);
        // 毎フレームのupdateを呼んで，render
        // reqestAnimationFrame により次フレームを呼ぶ
        let lookX = -1;
        let timer = performance.now();
        const cameraSpeed = 1.5;
        const render: FrameRequestCallback = (_time) => {
            if (previousTime === null) {
                previousTime = _time;
                renderer.render(this.scene, camera);
                requestAnimationFrame(render);
                return;
            }
            let deltaTime = (_time - previousTime) / 1000;
            previousTime = _time;
            deltaTime = Math.min(deltaTime, 0.03);
            elapsedTime += deltaTime;
            if (elapsedTime >= startDelay) {
                this.world.step(1 / 60, deltaTime, 3);
                this.physicsObjects.forEach((object) => {
                    object.mesh.position.set(
                        object.body.interpolatedPosition.x,
                        object.body.interpolatedPosition.y,
                        object.body.interpolatedPosition.z
                    );
                    object.mesh.quaternion.set(
                        object.body.interpolatedQuaternion.x,
                        object.body.interpolatedQuaternion.y,
                        object.body.interpolatedQuaternion.z,
                        object.body.interpolatedQuaternion.w
                    );
                });
            }
            const moveDistance = cameraSpeed * deltaTime;
            camera.position.x += moveDistance;
            lookX += moveDistance;
            camera.lookAt(lookX, 5, 0);
            // orbitControls.update();

            renderer.render(this.scene, camera);
            requestAnimationFrame(render);
        }
        requestAnimationFrame(render);

        renderer.domElement.style.cssFloat = "left";
        renderer.domElement.style.margin = "10px";
        return renderer.domElement;
    }

    // シーンの作成(全体で1回)
    private createScene = async () => {
        this.scene = new THREE.Scene();
        const loader = new RGBELoader();
        try {
            const texture = await loader.loadAsync("texture/room.hdr");

            texture.mapping = THREE.EquirectangularReflectionMapping;
            this.scene.environment = texture;
            this.scene.environmentIntensity = 0.5;

            console.log("HDR読み込み完了");
        } catch (error) {
            console.error("HDR読み込み失敗", error);
        }
        const textureLoader = new THREE.TextureLoader();

        //ライトの設定
        const light = new THREE.DirectionalLight(0xffffff);
        light.position.set(10, 100, 10);
        light.castShadow = true;
        this.scene.add(light);


        // ワールド
        this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82 * 2, 0) });
        const world = this.world;
        world.defaultContactMaterial.friction = 0.01;
        world.defaultContactMaterial.restitution = 0;

        // 地面
        const material: THREE.Material = new THREE.MeshPhysicalMaterial({
            color: 0xf0f0f0,
            roughness: 0.7
        });
        const planeGeometry = new THREE.PlaneGeometry(500, 100);
        const planeMesh = new THREE.Mesh(planeGeometry, material);
        planeMesh.receiveShadow = true;
        planeMesh.material.side = THREE.DoubleSide; // 両面
        planeMesh.rotateX(-Math.PI / 2);
        this.scene.add(planeMesh);
        const planeShape = new CANNON.Plane()
        const planeBody = new CANNON.Body({ mass: 0 })
        planeBody.addShape(planeShape)
        planeBody.position.set(planeMesh.position.x, planeMesh.position.y, planeMesh.position.z);
        planeBody.quaternion.set(planeMesh.quaternion.x, planeMesh.quaternion.y, planeMesh.quaternion.z, planeMesh.quaternion.w);
        world.addBody(planeBody)

        const ballMaterial = new CANNON.Material();

        // ボール
        const createBall = (r: number, x: number, y: number, z: number) => {
            // 見た目
            const geometry = new THREE.SphereGeometry(r, 32, 32);
            const material = new THREE.MeshPhysicalMaterial({
                color: 0xdbf1ff,
                transmission: 1,
                roughness: 0,
                metalness: 0,
                ior: 1.52,
                thickness: 1
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y + r, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            // 物理演算用
            const shape = new CANNON.Sphere(r);
            const body = new CANNON.Body({
                mass: 5,
                shape: shape,
                position: new CANNON.Vec3(x, y + r, z),
                material: ballMaterial
            })
            body.linearDamping = 0;
            body.angularDamping = 0;
            world.addBody(body);
            this.physicsObjects.push({
                mesh: mesh,
                body: body
            });
        };

        const texture = textureLoader.load('texture/wood_color.png');
        texture.colorSpace = THREE.SRGBColorSpace;
        const normalmap = textureLoader.load('texture/wood_normal.png');
        const roughnessmap = textureLoader.load('texture/wood_roughness.png');
        const woodMaterial: THREE.Material = new THREE.MeshPhysicalMaterial({
            map: texture,
            normalMap: normalmap,
            roughnessMap: roughnessmap,
            side: THREE.DoubleSide
        });

        // ドミノ
        const createDomino = (x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number) => {
            const width = 0.5;
            const height = 1;
            const depth = 0.1;
            // 見た目
            const geometry = new THREE.BoxGeometry(width, height, depth);
            const mesh = new THREE.Mesh(geometry, woodMaterial);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.position.set(x, y + height / 2, z);
            mesh.lookAt(lookX, y + height / 2 + lookY, lookZ);
            this.scene.add(mesh);
            // 物理演算用
            const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
            const body = new CANNON.Body({
                mass: 1,
                shape: shape,
                position: new CANNON.Vec3(x, y + height / 2, z)
            });
            body.quaternion.set(
                mesh.quaternion.x,
                mesh.quaternion.y,
                mesh.quaternion.z,
                mesh.quaternion.w
            );
            world.addBody(body);
            this.physicsObjects.push({
                mesh: mesh,
                body: body
            });
        }

        // レール
        const createRail = (x: number, y: number, z: number, katamuki: number, ry: number) => {
            const length = 4;
            const width = 0.6;
            const wallHeight = 0.2;
            const wallThckness = 0.07;
            // 見た目
            const shape = new THREE.Shape();
            shape.moveTo(-width / 2, 0);
            shape.lineTo(-width / 2, wallHeight);
            shape.lineTo(-width / 2 + wallThckness, wallHeight);
            shape.lineTo(-width / 2 + wallThckness, wallThckness);
            shape.lineTo(width / 2 - wallThckness, wallThckness);
            shape.lineTo(width / 2 - wallThckness, wallHeight);
            shape.lineTo(width / 2, wallHeight);
            shape.lineTo(width / 2, 0);
            shape.closePath();
            const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
            geometry.translate(0, 0, -length / 2);
            const texture = textureLoader.load('texture/wood_color.png');
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.colorSpace = THREE.SRGBColorSpace;
            const normalmap = textureLoader.load('texture/wood_normal.png');
            normalmap.wrapS = THREE.RepeatWrapping;
            normalmap.wrapT = THREE.RepeatWrapping;
            const roughnessmap = textureLoader.load('texture/wood_roughness.png');
            roughnessmap.wrapT = THREE.RepeatWrapping;
            roughnessmap.wrapS = THREE.RepeatWrapping;
            const material: THREE.Material = new THREE.MeshPhysicalMaterial({
                map: texture,
                normalMap: normalmap,
                roughnessMap: roughnessmap,
                side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.position.set(x, y, z);
            mesh.rotation.y = ry;
            mesh.rotateX(katamuki);
            this.scene.add(mesh);
            // 物理
            const vertices = geometry.attributes.position.array as Float32List;
            const indices: number[] = [];
            for (let i = 0; i < vertices.length / 3; i++) {
                indices.push(i);
            }
            const trimesh = new CANNON.Trimesh(Array.from(vertices), indices);
            const body = new CANNON.Body({ mass: 0 });
            body.addShape(trimesh);
            body.position.set(x, y, z);
            body.quaternion.copy(mesh.quaternion as any);
            world.addBody(body);
            return {
                mesh, body
            };
        }

        const createKabe = (x: number, y: number, z: number, width: number, height: number, depth: number) => {
            const geometry = new THREE.BoxGeometry(width, height, depth);
            const texture = textureLoader.load('texture/kabe_color.png');
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(
                Math.max(1, width / 6),
                Math.max(1, height / 6)
            );
            const normalmap = textureLoader.load('texture/kabe_normal.png');
            normalmap.wrapS = THREE.RepeatWrapping;
            normalmap.wrapT = THREE.RepeatWrapping;
            normalmap.repeat.set(
                Math.max(1, width / 6),
                Math.max(1, height / 6)
            );
            const roughnessmap = textureLoader.load('texture/kabe_roughness.png');
            roughnessmap.wrapS = THREE.RepeatWrapping;
            roughnessmap.wrapT = THREE.RepeatWrapping;
            roughnessmap.repeat.set(
                Math.max(1, width / 6),
                Math.max(1, height / 6)
            );
            const material: THREE.Material = new THREE.MeshPhysicalMaterial({
                map: texture,
                normalMap: normalmap,
                roughnessMap: roughnessmap,
                side: THREE.DoubleSide,
                roughness: 1
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y + height / 2, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            // 物理
            const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
            const body = new CANNON.Body({
                mass: 0,
                shape: shape,
                position: new CANNON.Vec3(x, y + height / 2, z)
            });
            body.quaternion.set(
                mesh.quaternion.x,
                mesh.quaternion.y,
                mesh.quaternion.z,
                mesh.quaternion.w
            );
            world.addBody(body);
            this.physicsObjects.push({
                mesh: mesh,
                body: body
            });

        }

        const createTranporin = (x: number, y: number, z: number, rx: number, ry: number, rz: number, hanpatu: number) => {
            const geometry = new THREE.CylinderGeometry(0.6, 0.6, 0.2, 32);
            const material = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            mesh.rotation.set(rx, ry, rz);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            // 物理
            const PhysicalMaterial = new CANNON.Material();
            const shape = new CANNON.Cylinder(0.6, 0.6, 0.2, 32);
            const body = new CANNON.Body({
                mass: 0,
                material: PhysicalMaterial,
                shape: shape,
                position: new CANNON.Vec3(x, y, z)
            });
            body.quaternion.set(
                mesh.quaternion.x,
                mesh.quaternion.y,
                mesh.quaternion.z,
                mesh.quaternion.w
            )
            const contactMaterial = new CANNON.ContactMaterial(
                ballMaterial,
                PhysicalMaterial,
                {
                    friction: 0.01,
                    restitution: hanpatu
                }
            );
            world.addContactMaterial(contactMaterial);
            world.addBody(body);
            this.physicsObjects.push({
                mesh: mesh,
                body: body
            });
            return {
                mesh, body
            };
        }

        const createFlag = (x: number, y: number, z: number, texture: THREE.Texture) => {
            const baseT = 0.05;
            const baseH = 0.8;
            const baseD = 0.8;
            const poleL = 3;
            const poleR = 0.025;
            const flagW = 0.7;
            const flagH = 0.7;

            const flagGroup = new THREE.Group();
            flagGroup.position.set(x, y + baseH / 2, z);
            this.scene.add(flagGroup);

            const baseGeometry = new THREE.BoxGeometry(baseT, baseH, baseD);
            const metalMaterial = new THREE.MeshPhysicalMaterial({
                color: 0x777777,
                metalness: 0.5,
                roughness: 0.1
            });
            const baseMesh = new THREE.Mesh(baseGeometry, metalMaterial);
            baseMesh.position.set(0, 0, 0);
            baseMesh.castShadow = true;
            baseMesh.receiveShadow = true;
            flagGroup.add(baseMesh);

            const poleGeometry = new THREE.CylinderGeometry(poleR, poleR, poleL, 32);
            const poleMesh = new THREE.Mesh(poleGeometry, metalMaterial);
            poleMesh.rotation.z = Math.PI / 2;
            poleMesh.position.set(-baseT / 2 - poleL / 2, -baseH / 2, baseH / 2);
            poleMesh.castShadow = true;
            poleMesh.receiveShadow = true;
            flagGroup.add(poleMesh);

            const clothGeometry = new THREE.PlaneGeometry(flagW, flagH);
            const clothMaterial = new THREE.MeshPhysicalMaterial({
                map: texture,
                side: THREE.DoubleSide,
                roughness: 0.9
            });
            const clothMesh = new THREE.Mesh(clothGeometry, clothMaterial);
            clothMesh.position.set(-baseT / 2 - poleL + flagW / 2, 0, baseH / 2);
            clothMesh.castShadow = true;
            clothMesh.receiveShadow = true;
            flagGroup.add(clothMesh);

            const baseShape = new CANNON.Box(new CANNON.Vec3(baseT / 2, baseH / 2, baseD / 2));
            const baseBody = new CANNON.Body({
                mass: 1,
                shape: baseShape,
                position: new CANNON.Vec3(x, y + baseH / 2, z),
            });
            world.addBody(baseBody);
            this.physicsObjects.push({
                mesh: flagGroup,
                body: baseBody
            });
        }

        createBall(0.2, -1, 10, 0);
        createKabe(1, 0, -2, 10, 11, 2);
        createRail(0, 9, 0, Math.PI / 18, Math.PI / 2);
        createRail(3, 7.5, 0, -Math.PI / 16, Math.PI / 2);
        createRail(0, 6, 0, Math.PI / 14, Math.PI / 2);
        createKabe(3.5, 0, 0, 15, 4, 10);
        for (let i = 0; i < 3; i++) {
            createDomino(3.5 + i * 0.5, 4, 0, 100, 0, 0);
        }
        for (let i = 0; i < 8; i++) {
            const x = 4.5 + 2 * Math.cos(Math.PI / 16 * i);
            const z = 2 + -2 * Math.sin(Math.PI / 16 * i);
            const nextX = 4.5 + 2 * Math.cos(Math.PI / 16 * (i + 1));
            const nextZ = 2 + -2 * Math.sin(Math.PI / 16 * (i + 1));
            createDomino(x, 4, z, nextX, 0, nextZ);
        }
        for (let i = 0; i < 8; i++) {
            const x = 8.5 - 2 * Math.cos(Math.PI / 16 * i);
            const z = 2.5 + 2 * Math.sin(Math.PI / 16 * i);
            const nextX = 8.5 - 2 * Math.cos(Math.PI / 16 * (i + 1));
            const nextZ = 2.5 + 2 * Math.sin(Math.PI / 16 * (i + 1));
            createDomino(x, 4, z, nextX, 0, nextZ);
        }
        for (let i = 0; i < 3; i++) {
            createDomino(8.5 + i * 0.5, 4, 4.5, 100, 0, 4.5);
        }
        createBall(0.2, 10.65, 4, 4.5);
        createRail(11.3, 3, 2.8, -Math.PI / 12, 0);
        createKabe(0, 0, 0, 180, 1, 20);
        createTranporin(11.5, 2, 0, Math.PI / 6, 0, -Math.PI / 12, 1.5);
        createTranporin(13.5, 2, 2, -Math.PI / 6, 0, 0, 1);
        createTranporin(15.5, 2, -1, Math.PI / 6, 0, 0, 1);

        for (let i = 0; i < 10; i++) {
            createDomino(18 + i * 0.5, 1, 0, 100, 0, 0);
        }
        for (let i = 0; i < 12; i++) {
            const x = 22.5 + 3 * Math.cos(Math.PI / 24 * i);
            const z = 2.3 - 2 * Math.sin(Math.PI / 24 * i);
            const nextX = 22.5 + 3 * Math.cos(Math.PI / 24 * (i + 1));
            const nextZ = 2.3 - 2 * Math.sin(Math.PI / 24 * (i + 1));
            createDomino(x, 1, z, nextX, 0, nextZ);
        }
        for (let i = 0; i < 38; i++) {
            createDomino(23 + i * 0.5, 1, 0, 100, 0, 0);
        }
        for (let i = 0; i < 12; i++) {
            const x = 22.5 + 3 * Math.cos(Math.PI / 24 * i);
            const z = -(2.3 - 2 * Math.sin(Math.PI / 24 * i));
            const nextX = 22.5 + 3 * Math.cos(Math.PI / 24 * (i + 1));
            const nextZ = -(2.3 - 2 * Math.sin(Math.PI / 24 * (i + 1)));
            createDomino(x, 1, z, nextX, 0, nextZ);
        }
        for (let i = 0; i < 6; i++) {
            createDomino(26 + i * 0.5, 1, 2.5, 100, 0, 0);
        }
        for (let i = 0; i < 6; i++) {
            createDomino(26 + i * 0.5, 1, -2.5, 100, 0, 0);
        }
        for (let i = 0; i < 12; i++) {
            const x = 28.5 + 3 * Math.cos(Math.PI - Math.PI / 24 * i);
            const z = 3 + 2 * Math.sin(Math.PI - Math.PI / 24 * i);
            const nextX = 28.5 + 3 * Math.cos(Math.PI - Math.PI / 24 * (i + 1));
            const nextZ = 3 + 2 * Math.sin(Math.PI - Math.PI / 24 * (i + 1));
            createDomino(x, 1, z, nextX, 0, nextZ);
        }
        for (let i = 0; i < 12; i++) {
            const x = 28.5 + 3 * Math.cos(Math.PI - Math.PI / 24 * i);
            const z = -(3 + 2 * Math.sin(Math.PI - Math.PI / 24 * i));
            const nextX = 28.5 + 3 * Math.cos(Math.PI - Math.PI / 24 * (i + 1));
            const nextZ = -(3 + 2 * Math.sin(Math.PI - Math.PI / 24 * (i + 1)));
            createDomino(x, 1, z, nextX, 0, nextZ);
        }
        for (let i = 0; i < 23; i++) {
            const x = 29 + i * 0.5;
            if(i < 23){
                createDomino(x, 1, 5, 100, 0, 0);
            }
            if(i < 17){
                createDomino(x, 1, 2.5, 100, 0, 0);
            }
            if(i < 18){
                createDomino(x, 1, -2.5, 100, 0, 0);
            }
            if(i < 16){
                createDomino(x, 1, -5, 100, 0, 0);
            }
        }
        const g = textureLoader.load('texture/g.png');
        createFlag(37, 1, -5, g);
        const o = textureLoader.load('texture/o.png');
        createFlag(38, 1, -2.5, o);
        const a = textureLoader.load('texture/a.png');
        createFlag(42, 1, 0, a);
        const l = textureLoader.load('texture/l.png');
        createFlag(37.5, 1, 2.5, l);
        const bikkuri = textureLoader.load('texture/bikkuri.png');
        createFlag(40.5, 1, 5, bikkuri);

        // 毎フレームのupdateを呼んで，更新
        // reqestAnimationFrame により次フレームを呼ぶ
        /*
        const update: FrameRequestCallback = (_time) => {
            world.fixedStep();
            
            physicsObjects.forEach((object) => {
                object.mesh.position.set(
                    object.body.position.x,
                    object.body.position.y,
                    object.body.position.z
                );
                object.mesh.quaternion.set(
                    object.body.quaternion.x,
                    object.body.quaternion.y,
                    object.body.quaternion.z,
                    object.body.quaternion.w
                )
            });
            requestAnimationFrame(update);
        }
        requestAnimationFrame(update);
        */
    }
}

window.addEventListener("DOMContentLoaded", init);

async function init() {
    const container = new ThreeJSContainer();

    const viewport = await container.createRendererDOM(800, 480, new THREE.Vector3(-1, 7, 10.5));
    document.body.appendChild(viewport)
}
