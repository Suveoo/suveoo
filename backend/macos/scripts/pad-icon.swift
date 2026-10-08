// pad-icon.swift — 把源图等比缩放居中到 1024 透明画布（内容占 content 像素）
// 用法：swift pad-icon.swift <in.png> <out.png> <content-size>
// 背景：直接全幅 favicon 做 icns，macOS Dock/Applications 里比其他图标大一圈
// （系统图标内容约 824/1024 网格）；合成留白后与其他应用视觉等大。
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 4 else { print("usage: pad-icon.swift <in.png> <out.png> <content-size>"); exit(1) }
let inURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])
let content = CGFloat(Int(args[3]) ?? 824)

guard let src = CGImageSourceCreateWithURL(inURL as CFURL, nil),
      let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { print("read fail: \(args[1])"); exit(1) }

let canvas = 1024
guard let ctx = CGContext(data: nil, width: canvas, height: canvas, bitsPerComponent: 8,
                          bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { print("ctx fail"); exit(1) }
ctx.interpolationQuality = .high
ctx.clear(CGRect(x: 0, y: 0, width: canvas, height: canvas))
let scale = min(content / CGFloat(img.width), content / CGFloat(img.height))
let w = CGFloat(img.width) * scale
let h = CGFloat(img.height) * scale
ctx.draw(img, in: CGRect(x: (CGFloat(canvas) - w) / 2, y: (CGFloat(canvas) - h) / 2, width: w, height: h))
guard let out = ctx.makeImage() else { print("render fail"); exit(1) }

guard let dest = CGImageDestinationCreateWithURL(outURL as CFURL, UTType.png.identifier as CFString, 1, nil) else { print("dest fail"); exit(1) }
CGImageDestinationAddImage(dest, out, nil)
if !CGImageDestinationFinalize(dest) { print("write fail"); exit(1) }
print("ok \(outURL.path) content=\(Int(content))")
