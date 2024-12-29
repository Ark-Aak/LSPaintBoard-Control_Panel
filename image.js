import sharp from 'sharp';
import fs from 'fs';

function removeColorToTransparent(imageBuffer, color) {
	return sharp(imageBuffer)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true })
		.then(({ data, info }) => {
			const { width, height, channels } = info;
			const colorRGB = { r: color[0], g: color[1], b: color[2] };

			for (let i = 0; i < data.length; i += channels) {
				const r = data[i], g = data[i + 1], b = data[i + 2];
				if (r === colorRGB.r && g === colorRGB.g && b === colorRGB.b) {
					data[i + 3] = 0;
				}
			}

			return sharp(data, { raw: { width, height, channels } })
				.ensureAlpha()
				.png()
				.toBuffer();
		});
}

function modifyRectangleAlpha(imageBuffer, x, y, width, height, alphaValue) {
	return sharp(imageBuffer)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true })
		.then(({ data, info }) => {
			const { width: imgWidth, height: imgHeight, channels } = info;

			for (let i = y; i < y + height; i++) {
				for (let j = x; j < x + width; j++) {
					const pixelIndex = (i * imgWidth + j) * channels + 3;
					if (pixelIndex >= 0 && pixelIndex < data.length) {
						data[pixelIndex] = alphaValue;
					}
				}
			}

			return sharp(data, { raw: { width: imgWidth, height: imgHeight, channels } })
				.ensureAlpha()
				.png()
				.toBuffer();
		});
}

(async () => {
	const args = process.argv.slice(2);
	if (args.length < 2) {
		console.error('参数列表：\nremove_color <image> <R> <G> <B>\nmodify_transparent <image> <xL> <yL> <xR> <yR> <alpha>');
		process.exit(1);
	}
	const op = args[0];
	const imagePath = args[1];

	if (!fs.existsSync(imagePath)) {
		console.error('错误: 图片文件不存在');
		process.exit(1);
	}

	if (!imagePath.endsWith(".png")) {
		console.error('错误: 只支持 png 图片');
		process.exit(1);
	}

	let buffer = await sharp(imagePath).toBuffer();
	if (op === 'remove_color' && args.length === 5) {
		const R = parseInt(args[2]), G = parseInt(args[3]), B = parseInt(args[4]);
		removeColorToTransparent(buffer, [R, G, B])
			.then((data) => {
				return fs.promises.writeFile(imagePath, data);
			})
			.catch((err) => console.error('Error removing color:', err));
	} else if (op === 'modify_transparent' && args.length === 7) {
		const xL = parseInt(args[2]), xR = parseInt(args[3]);
		const yL = parseInt(args[4]), yR = parseInt(args[5]);
		const alpha = parseInt(args[6]);
		modifyRectangleAlpha(buffer, xL, yL, xR - xL + 1, yR - yL + 1, alpha)
			.then((data) => {
				return fs.promises.writeFile(imagePath, data);
			})
			.catch((err) => console.error('Error modifying alpha:', err));
	} else {
		console.error('参数列表：\nremove_color <R> <G> <B>\nmodify_transparent <xL> <yL> <xR> <yR> <alpha>');
		process.exit(1);
	}
})();
