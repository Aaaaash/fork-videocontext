import VideoContext from "./videocontext.js";

const canvas = document.querySelector("#canvas");
const videoctx = new VideoContext(canvas);

const videos = [
    "../docs/assets/movie.mkv",
    "../docs/assets/bg.mp4",
];

const combineDefinition = {
    title: "combineDefinition",
    vertexShader : "\
        attribute vec2 a_position;\
        attribute vec2 a_texCoord;\
        varying vec2 v_texCoord;\
        void main() {\
            gl_Position = vec4(vec2(2.0,2.0)*vec2(1.0, 1.0), 0.0, 1.0);\
            v_texCoord = a_texCoord;\
        }",
    fragmentShader : "\
        precision mediump float;\
        uniform sampler2D u_image;\
        uniform float a;\
        varying vec2 v_texCoord;\
        varying float v_progress;\
        void main(){\
            vec4 color = texture2D(u_image, v_texCoord);\
            gl_FragColor = color;\
        }",
    properties:{
        "a":{type:"uniform", value:0.0},
    },
    inputs:["u_image"]
};
const trackNode = videoctx.compositor(combineDefinition);

const videoNode = videoctx.video(videos[0]);
videoNode.start(0);
videoNode.stop(10);
const videoNode2 = videoctx.video(videos[1]);
videoNode2.start(0);
videoNode2.stop(10);

videoNode.connect(trackNode);
videoNode2.connect(trackNode);
trackNode.connect(videoctx.destination);

videoctx.play();
