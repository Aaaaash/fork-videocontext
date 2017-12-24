import VideoContext from "./videocontext.js";

const canvas = document.querySelector("#canvas");
const videoctx = new VideoContext(canvas);

const videos = [
    "../docs/assets/movie.mkv",
    "../docs/assets/bg.mp4",
];

// const videoNode = videoctx.video("../docs/assets/bg.mp4");
// // videoNode.startAt(0);
const videoNode = videoctx.video("../docs/assets/movie.mkv");
videoNode.startAt(0);
// const cropRect = [0.5, 0.5, 1.0, 1.0];
// const dstRect = [0.5, 0.5, 1.0, 1.0];

// const scale = 480 / 480;
// const scaleWidth = 852 * scale;
// if (scaleWidth >= 852) {
//     const padw = (scaleWidth - 852) / 2.0;
//     cropRect[0] = padw / scaleWidth;
//     cropRect[1] = 0.0;
//     cropRect[2] = 852 / scaleWidth;
//     cropRect[3] = 1.0;
// } else {
//     const padw = (852 - scaleWidth) / 2.0;
//     dstRect[0] = padw / 852;
//     dstRect[1] = 0.0;
//     dstRect[2] = scaleWidth / 852;
//     dstRect[3] = 1.0;
// }

// const cropWidthNode = videoctx.effect(VideoContext.DEFINITIONS.CROP_WIDTH);
// cropWidthNode.cropRect = cropRect;
// cropWidthNode.dstRect = dstRect;

// videoNode2.connect(videoNode);
videoNode.connect(videoctx.destination);

videoctx.play();
