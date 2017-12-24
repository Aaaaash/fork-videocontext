let cropWidth = {
    title: "Crop",
    description:
        "Crop images width (e.g can be used to make a black & white filter). Input color mix and output color mix can be adjusted.",
    vertexShader:
        "\
          attribute vec2 a_position;\
          attribute vec2 a_texCoord;\
          varying vec2 textureCoordinate;\
          void main() {\
              gl_Position = vec4(vec2(2.0,2.0)*a_position-vec2(1.0, 1.0), 0.0, 1.0);\
              textureCoordinate = a_texCoord;\
          }",
    fragmentShader:
        "\
          precision highp float;\
          varying highp vec2 textureCoordinate;\
          uniform sampler2D u_image;\
          uniform highp vec4 cropRect;\
          uniform highp vec4 dstRect;\
          \
          bool inBounds(vec2 p)\
          {\
              return ((p.x >= dstRect.x) && (p.x <= dstRect.x+dstRect.z) && (p.y >= dstRect.y) && (p.y <= dstRect.y+dstRect.w));\
          }\
          \
          void main()\
          {\
              if (inBounds(textureCoordinate)) {\
                  vec2 p = (textureCoordinate.xy - dstRect.xy)/dstRect.zw * cropRect.zw + cropRect.xy;\
                  gl_FragColor= texture2D(u_image, p);\
              }\
              else {\
                  gl_FragColor = vec4(0.0,0.0,0.0,1.0);\
              }\
          }",
    properties: {
        cropRect: { type: "uniform", value: [0.0, 0.0, 1.0, 1.0] },
        dstRect: { type: "uniform", value: [0.0, 0.0, 1.0, 1.0] }
    },
    inputs: ["u_image"]
};

export default cropWidth;
