// The park's game engine (OP-129): Phaser 3 built from its own source, as Phaser's entry
// (node_modules/phaser/src/phaser.js) builds it, with only the parts the park draws with. Left out:
// physics, tilemaps, sound, the asset loader (the park fetches its own art), the actions, and the
// game objects no scene makes (the park adds images, graphics, containers, text, particles, zones,
// rectangles and ellipses). vite.config.ts builds this into the one module the dev server, the unit
// tests and the build load as 'phaser'; engine.test.ts fails when the park's code asks for a part
// left out here, which is then added below (Phaser's entry shows how).
// TODO-DOCS: ARCHITECTURE: the client's engine is this slim Phaser build; a new kind of game object
// or a Phaser system (sound, physics) is added here first.

require('phaser/src/polyfills/requestVideoFrame');

var CONST = require('phaser/src/const');
var Extend = require('phaser/src/utils/object/Extend');

// Each factory and creator registers its game object with the scenes' `add` and `make` as it loads.
var GameObjects = {
    Events: require('phaser/src/gameobjects/events'),
    DisplayList: require('phaser/src/gameobjects/DisplayList'),
    GameObjectCreator: require('phaser/src/gameobjects/GameObjectCreator'),
    GameObjectFactory: require('phaser/src/gameobjects/GameObjectFactory'),
    UpdateList: require('phaser/src/gameobjects/UpdateList'),
    Components: require('phaser/src/gameobjects/components'),
    GetCalcMatrix: require('phaser/src/gameobjects/GetCalcMatrix'),
    BuildGameObject: require('phaser/src/gameobjects/BuildGameObject'),
    BuildGameObjectAnimation: require('phaser/src/gameobjects/BuildGameObjectAnimation'),
    GameObject: require('phaser/src/gameobjects/GameObject'),
    Container: require('phaser/src/gameobjects/container/Container'),
    Graphics: require('phaser/src/gameobjects/graphics/Graphics'),
    Image: require('phaser/src/gameobjects/image/Image'),
    Particles: require('phaser/src/gameobjects/particles'),
    Text: require('phaser/src/gameobjects/text/Text'),
    GetTextSize: require('phaser/src/gameobjects/text/GetTextSize'),
    MeasureText: require('phaser/src/gameobjects/text/MeasureText'),
    TextStyle: require('phaser/src/gameobjects/text/TextStyle'),
    Zone: require('phaser/src/gameobjects/zone/Zone'),
    Shape: require('phaser/src/gameobjects/shape/Shape'),
    Ellipse: require('phaser/src/gameobjects/shape/ellipse/Ellipse'),
    Rectangle: require('phaser/src/gameobjects/shape/rectangle/Rectangle'),
    Factories: {
        Container: require('phaser/src/gameobjects/container/ContainerFactory'),
        Graphics: require('phaser/src/gameobjects/graphics/GraphicsFactory'),
        Image: require('phaser/src/gameobjects/image/ImageFactory'),
        Particles: require('phaser/src/gameobjects/particles/ParticleEmitterFactory'),
        Text: require('phaser/src/gameobjects/text/TextFactory'),
        Zone: require('phaser/src/gameobjects/zone/ZoneFactory'),
        Ellipse: require('phaser/src/gameobjects/shape/ellipse/EllipseFactory'),
        Rectangle: require('phaser/src/gameobjects/shape/rectangle/RectangleFactory')
    },
    Creators: {
        Container: require('phaser/src/gameobjects/container/ContainerCreator'),
        Graphics: require('phaser/src/gameobjects/graphics/GraphicsCreator'),
        Image: require('phaser/src/gameobjects/image/ImageCreator'),
        Particles: require('phaser/src/gameobjects/particles/ParticleEmitterCreator'),
        Text: require('phaser/src/gameobjects/text/TextCreator'),
        Zone: require('phaser/src/gameobjects/zone/ZoneCreator')
    }
};

var Phaser = {
    Animations: require('phaser/src/animations'),
    BlendModes: require('phaser/src/renderer/BlendModes'),
    Cache: require('phaser/src/cache'),
    Cameras: require('phaser/src/cameras'),
    Core: require('phaser/src/core'),
    Class: require('phaser/src/utils/Class'),
    Create: require('phaser/src/create'),
    Curves: require('phaser/src/curves'),
    Data: require('phaser/src/data'),
    Display: require('phaser/src/display'),
    DOM: require('phaser/src/dom'),
    Events: require('phaser/src/events'),
    FX: require('phaser/src/fx'),
    Game: require('phaser/src/core/Game'),
    GameObjects: GameObjects,
    Geom: require('phaser/src/geom'),
    Input: require('phaser/src/input'),
    Math: require('phaser/src/math'),
    Plugins: require('phaser/src/plugins'),
    Renderer: require('phaser/src/renderer'),
    Scale: require('phaser/src/scale'),
    ScaleModes: require('phaser/src/renderer/ScaleModes'),
    Scene: require('phaser/src/scene/Scene'),
    Scenes: require('phaser/src/scene'),
    Structs: require('phaser/src/structs'),
    Textures: require('phaser/src/textures'),
    Time: require('phaser/src/time'),
    Tweens: require('phaser/src/tweens'),
    Utils: require('phaser/src/utils')
};

Phaser = Extend(false, Phaser, CONST);

module.exports = Phaser;

globalThis.Phaser = Phaser;
