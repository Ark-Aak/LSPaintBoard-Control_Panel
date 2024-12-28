/*eslint no-unused-vars: ["error", { "caughtErrorsIgnorePattern": "^e(rror)?$" }]*/

import express from 'express';
import fs from 'fs';
import fetch from 'node-fetch';
import WebSocket from 'ws';
import nunjucks from 'nunjucks';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const WEBPORT = 3001;
const DRAWPORT = 3002;

const WS_URL = 'wss://api.paintboard.ayakacraft.com:32767/api/paintboard/ws';
const BASE_URL = 'https://api.paintboard.ayakacraft.com:32767/api';
// const WS_URL = 'ws://localhost:32767/api/paintboard/ws';
// const BASE_URL = 'http://localhost:32767/api';
const TOKEN_FILE = './tokens.txt';
const UPLOAD_DIR = './uploads/';

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, UPLOAD_DIR);  // 上传目录
	},
	filename: (req, file, cb) => {
		cb(null, `${Date.now()}_${file.originalname}`);
	},
});

const upload = multer({ storage });

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
	fs.mkdirSync(UPLOAD_DIR);
}

if (!fs.existsSync(TOKEN_FILE)) {
	fs.writeFileSync(TOKEN_FILE, "");
}

// 上传图片并提取像素信息的 API
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
	if (!req.file) {
		return res.status(400).send('没有选择任何文件。');
	}

	const filePath = path.join(UPLOAD_DIR, req.file.filename);

	try {
		// 使用 sharp 处理上传的图片
		const image = sharp(filePath);
		const metadata = await image.metadata(); // 获取图片元数据（包括尺寸等）
		const { width, height, channels } = metadata;
		const pixels = await image.raw().toBuffer(); // 获取像素数据
		const pixelData = [];
		for (let i = 0; i < pixels.length; i += channels) {
			const r = pixels[i];
			const g = pixels[i + 1];
			const b = pixels[i + 2];
			if (channels === 4) {
				const a = pixels[i + 3];
				pixelData.push({ r, g, b, a });
			} else {
				pixelData.push({ r, g, b });
			}
		}
		res.json({ width, height, pixelData });
	} catch (error) {
		res.status(500).send('图片处理失败。');
	}
});

nunjucks.configure(path.join(__dirname, 'views'), {
	autoescape: true,
	express: app,
	noCache: true,
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', (req, res) => {
	res.render('index.html');
});

import { createCanvas } from 'canvas';

let heatmap = [];
const heatmap_millseconds = 600 * 1000

setInterval(() => {
	while (heatmap.length && heatmap[0][0] < Date.now() - heatmap_millseconds) {
		heatmap.shift();
	}
}, 10000);

app.get('/heatmap.png', (req, res) => {
	const hsv2rgb = (h, s, v) => {
		var r, g, b, i, f, p, q, t;
		i = Math.floor(h * 6);
		f = h * 6 - i;
		p = v * (1 - s);
		q = v * (1 - f * s);
		t = v * (1 - (1 - f) * s);
		switch (i % 6) {
			case 0: r = v, g = t, b = p; break;
			case 1: r = q, g = v, b = p; break;
			case 2: r = p, g = v, b = t; break;
			case 3: r = p, g = q, b = v; break;
			case 4: r = t, g = p, b = v; break;
			case 5: r = v, g = p, b = q; break;
		}
		return {
			r: Math.round(r * 255),
			g: Math.round(g * 255),
			b: Math.round(b * 255)
		};
	};

	const map = new Map();
	let maximum = 0;
	const convertRatio = 20;
	const blockSize = 10;

	heatmap.forEach((item) => {
		const key = [Math.floor(item[1] / convertRatio), Math.floor(item[2] / convertRatio)].toString();
		if (map.has(key)) {
			map.set(key, map.get(key) + 1);
			if (map.get(key) > maximum) {
				maximum = map.get(key);
			}
		} else {
			map.set(key, 1);
			if (1 > maximum) {
				maximum = 1;
			}
		}
	});

	const canvas = createCanvas(Math.floor(1000 / convertRatio * blockSize), Math.floor(600 / convertRatio * blockSize));
	const ctx = canvas.getContext('2d');
	const canvasData = ctx.getImageData(0, 0, Math.floor(1000 / convertRatio * blockSize), Math.floor(600 / convertRatio * blockSize));

	const drawReal = (x, y, r, g, b, a) => {
		const index = Math.floor(x + y * 1000 / convertRatio * blockSize) * 4;
		canvasData.data[index + 0] = r;
		canvasData.data[index + 1] = g;
		canvasData.data[index + 2] = b;
		canvasData.data[index + 3] = a;
	}

	const drawPixel = (x, y, r, g, b, a) => {
		const rx = x * blockSize, ry = y * blockSize;
		for (let i = 0; i < blockSize; i++) {
			for (let j = 0; j < blockSize; j++) {
				drawReal(rx + i, ry + j, r, g, b, a);
			}
		}
	}

	for (let x = 0; x < Math.floor(1000 / convertRatio); x++) {
		for (let y = 0; y < Math.floor(600 / convertRatio); y++) {
			if (map.has([x, y].toString())) {
				const pseudo = hsv2rgb(0.7 - map.get([x, y].toString()) * 0.7 / maximum, 1, 0.65 + map.get([x, y].toString()) * 0.35 / maximum);
				drawPixel(x, y, pseudo.r, pseudo.g, pseudo.b, 255);
			} else {
				drawPixel(x, y, 0, 0, 0, 255);
			}
		}
	}

	ctx.putImageData(canvasData, 0, 0);

	const imageBuffer = canvas.toBuffer('image/png');

	res.setHeader('Content-Type', 'image/png').send(imageBuffer);
});

import { WebSocketServer } from 'ws';
import http from 'http';

const server = http.createServer();
const wss = new WebSocketServer({ server });

let logClients = [];

wss.on('connection', (client) => {
	logClients.push(client);
	client.on('close', () => {
		logClients = logClients.filter(c => c !== client);
	});
});

function getTime(type) {
	const date = new Date();
	if (type === 0) {
		return date.getTime();
	}
	else if (type === 1) {
		return date.toLocaleTimeString('en-US', { hour12: false });
	}
}

// 广播日志
function broadcastLog(message) {
	logClients.forEach(client => {
		if (client.readyState === WebSocket.OPEN) {
			client.send(message);
		}
	});
	console.log(message);
}

let ws;

let paintCb = new Map();
let processAttack;

let status = false;
let needRestart = false;

let lstPath, lstStartX, lstStartY;


let paintId = 0;
let paintCnt = 0;
let attackCnt = 0;
let recieveCnt = 0;
let coloredCnt = 0;
let queueTotal = 0, queuePos = 0;

setInterval(() => {
	let paintRate = paintCnt / 3.0;
	let attackRate = attackCnt / 3.0;
	let recieveRate = recieveCnt / 3.0;
	let coloredRate = coloredCnt / 3.0;
	const buffer = ws.bufferedAmount;
	attackCnt = 0;
	paintCnt = 0;
	recieveCnt = 0;
	coloredCnt = 0;
	reportMsg(JSON.stringify({ paintRate, attackRate, recieveRate, coloredRate, buffer, queueTotal, queuePos }));
}, 3000);

let board = [];

async function initBoard() {
	const st = getTime(0);
	await fetch(`${BASE_URL}/paintboard/getboard`)
		.then(response => {
			if (!response.ok) {
				broadcastLog(`获取绘版信息失败: ${response.status}`);
				return new ArrayBuffer();
			}
			broadcastLog(`绘版信息已返回。`);
			return response.arrayBuffer();
		})
		.then(arrayBuffer => {
			const byteArray = new Uint8Array(arrayBuffer);
			for (let y = 0; y < 600; y++) {
				for (let x = 0; x < 1000; x++) {
					const idx = (y * 1000 + x) * 3;
					let r = byteArray[idx], g = byteArray[idx + 1], b = byteArray[idx + 2];
					const pixel = { r, g, b };
					board[y][x] = pixel;
				}
			}
		}).catch(error => broadcastLog(`获取绘版信息失败: ${error}`));
	const ed = getTime(0);
	broadcastLog(`初始化耗时: ${ed - st} ms`);
}

for (let y = 0; y < 600; y++) {
	board[y] = [];
	for (let x = 0; x < 1000; x++) {
		board[y][x] = { r: 255, g: 255, b: 255 };
	}
}

async function init() {
	broadcastLog(`正在初始化绘版。`);
	await initBoard();
	broadcastLog(`绘版加载完成。`);
}

app.get('/init', (req, res) => { init(); res.status(200).end(); });

function connect() {
	broadcastLog("正在连接 WebSocket。");
	ws = new WebSocket(WS_URL);
	ws.binaryType = "arraybuffer";
	ws.onopen = async () => {
		const message = 'WebSocket 连接已打开。';
		broadcastLog(message);
		await init();
		if (!status && needRestart) {
			try {
				SdrawTask(lstPath, lstStartX, lstStartY);
				broadcastLog("正在自动重启画图任务。");
			} catch (e) {
				broadcastLog("自动重启画图任务失败。");
			}
			needRestart = false;
		}
		status = true;
	};

	ws.onmessage = async (event) => {
		const buffer = event.data;
		const dataView = new DataView(buffer);
		let offset = 0;
		while (offset < buffer.byteLength) {
			const type = dataView.getUint8(offset);
			offset += 1;
			switch (type) {
				case 0xfa: {
					const x = dataView.getUint16(offset, true);
					const y = dataView.getUint16(offset + 2, true);
					const colorR = dataView.getUint8(offset + 4);
					const colorG = dataView.getUint8(offset + 5);
					const colorB = dataView.getUint8(offset + 6);
					board[y][x] = { r: colorR, g: colorG, b: colorB };
					offset += 7;
					if (processAttack) await processAttack(x, y, colorR, colorG, colorB);
					heatmap.push([Date.now(), x, y]);
					break;
				}
				case 0xfc: {
					ws.send(new Uint8Array([0xfb]));
					break;
				}
				case 0xff: {
					recieveCnt++;
					const id = dataView.getUint32(offset, true);
					const code = dataView.getUint8(offset + 4);
					offset += 5;
					const cb = paintCb.get(id);
					if (cb) {
						cb(code);
						paintCb.delete(id);
					}
					break;
				}
				default:
					const message = `未知的消息类型: ${type}`;
					broadcastLog(message);
			}
		}
	};

	ws.onerror = (err) => {
		const message = `WebSocket 出错: ${err.message}。`;
		stopDrawing = true;
		isDrawing = false;
		broadcastLog(message);
	};

	ws.onclose = (err) => {
		const reason = err.reason ? err.reason : "Unknown";
		const message = `WebSocket 已经关闭 (${err.code}: ${reason})，尝试重连。`;
		if (isDrawing) needRestart = true;
		stopDrawing = true;
		isDrawing = false;
		broadcastLog(message);
		status = false;
		processAttack = null;
		setTimeout(connect, 0);
	};
}

connect();

let chunks = []; // 存储数据片段
let totalSize = 0;

function appendData(paintData) {
	chunks.push(paintData);
	totalSize += paintData.length;
}

function getMergedData() {
	let result = new Uint8Array(totalSize);
	let offset = 0;
	for (let chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	totalSize = 0;
	chunks = [];
	return result;
}

setInterval(() => {
	if (chunks.length > 0 && ws.readyState === WebSocket.OPEN) {
		ws.send(getMergedData());
	}
}, 1000 / 50.0);

function uintToUint8Array(uint, bytes) {
	const array = new Uint8Array(bytes);
	for (let i = 0; i < bytes; i++) {
		array[i] = uint & 0xff;
		uint = uint >> 8;
	}
	return array;
}

async function paint(uid, token, r, g, b, nowX, nowY) {
	// const id = (paintId++) % 4294967296;
	const id = (paintId++) % 1048576;
	paintCnt++;
	const tokenBytes = new Uint8Array(16);
	token.replace(/-/g, '').match(/.{2}/g).map((byte, i) =>
		tokenBytes[i] = parseInt(byte, 16));

	const paintData = new Uint8Array([
		0xfe,
		...uintToUint8Array(nowX, 2),
		...uintToUint8Array(nowY, 2),
		r, g, b,
		...uintToUint8Array(uid, 3),
		...tokenBytes,
		...uintToUint8Array(id, 4)
	]);

	appendData(paintData);

	paintCb.set(id, (code) => {
		switch (code) {
			case 0xef: // success
				coloredCnt++;
				break;
			case 0xed: // invalid token
				broadcastLog(`失效的 Token: ${token}#${uid}。`);
				break;
		}
	});
}

const reportServer = http.createServer();
const report = new WebSocketServer({ server: reportServer });

let reportClients = [];

report.on('connection', (client) => {
	reportClients.push(client)
	client.on('close', () => {
		reportClients = reportClients.filter(c => c !== client);
	});
});

function reportMsg(msg) {
	reportClients.forEach(client => {
		if (client.readyState === WebSocket.OPEN) {
			client.send(msg);
		}
	});
}

app.use(express.json());

// 获取 token
app.post('/api/paintboard/token', async (req, res) => {
	const { uid, paste } = req.body;
	if (!uid || !paste) {
		const errorMessage = '无效的 UID 或剪贴板。';
		return res.status(400).send(errorMessage);
	}
	try {
		const body = JSON.stringify({ uid, paste });
		const response = await fetch(`${BASE_URL}/auth/gettoken`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
		});
		if (!response.ok || response.status != 200) {
			return res.status(response.status).send('内部服务器错误。');
		}
		const data = await response.json();
		let token = data.data.token;
		try {
			const tokenData = JSON.stringify([token, uid]);
			fs.appendFileSync(TOKEN_FILE, tokenData + '\n');
		} catch (error) {
			res.status(500).send('内部服务器错误。');
		}
		res.json(data);
	} catch (error) {
		res.status(500).send('内部服务器错误。');
	}

});

// 读取 tokens 文件

let fTokens = [];
let idx = 0;
let info = { fmax: 0, sim: 5, mod: 30000, strategy: { cd: 'explosive', order: 'random', priority: 'none' } };

async function getNextToken() {
	if (info.strategy.cd === 'amortized') await delay(Math.ceil(info.mod / info.fmax));
	let res = fTokens[idx];
	idx += 1;
	if (idx >= info.fmax) {
		idx = 0;
		if (info.strategy.cd === 'explosive') await delay(info.mod);
	}
	return res;
}

app.get('/api/getinfo', (req, res) => {
	res.status(200).send(info);
});

function createNormalApi(name) {
	app.post('/api/' + name, (req, res) => {
		const { val } = req.body;
		info[name] = val;
		res.status(200).end();
	});
}

createNormalApi('fmax');
createNormalApi('sim');
createNormalApi('mod');

function createStrategyApi(name) {
	app.post('/api/strategy/' + name, (req, res) => {
		const { val } = req.body;
		info.strategy[name] = val;
		res.status(200).end();
	});
}

createStrategyApi('cd');
createStrategyApi('order');
createStrategyApi('priority');

app.get('/api/tokens', (req, res) => {
	try {
		const fileContent = fs.readFileSync(TOKEN_FILE, 'utf-8');
		const lines = fileContent
			.split('\n')
			.map(line => line.trim())
			.filter(line => line.length > 0);
		const tokens = lines.map((line) => {
			try {
				const tokenPair = JSON.parse(line);
				if (Array.isArray(tokenPair) && tokenPair.length === 2) {
					return { token: tokenPair[0], uid: parseInt(tokenPair[1]) };
				}
				return null;
			} catch (e) {
				return null;
			}
		}).filter(item => item !== null);
		fTokens = tokens;
		if (info.fmax == 0) info.fmax = tokens.length;
		res.json(tokens);
	} catch (error) {
		res.status(500).send('内部服务器错误。');
	}
});

app.get('/api/images', (req, res) => {
	try {
		const files = fs.readdirSync(UPLOAD_DIR).filter(file => !fs.statSync(path.join(UPLOAD_DIR, file)).isDirectory());
		res.json(files);
	} catch (error) {
		res.status(500).send('图像列表获取失败。');
	}
});

let isDrawing = false; // 控制是否继续绘画
let stopDrawing = false; // 控制是否停止任务

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

let pointQueue = [];

async function SdrawTask(imagePath, startX, startY) {
	// 绘画任务的主函数
	info.imagePath = imagePath.split('\\')[1];
	info.startX = startX;
	info.startY = startY;
	isDrawing = true;
	stopDrawing = false;

	pointQueue = [];

	const image = sharp(imagePath);
	const { width, height, channels } = await image.metadata();
	const pixels = await image.raw().toBuffer();
	const xL = startX, xR = startX + width - 1;
	const yL = startY, yR = startY + height - 1;
	broadcastLog(`图像位置: [(${xL}, ${yL}), (${xR}, ${yR})]`);

	const getPixelAt = (x, y) => {
		const index = (y * width + x) * channels; // 每个像素占 channels 个字节（RGB/RGBA）
		if (channels === 4) {
			return { r: pixels[index], g: pixels[index + 1], b: pixels[index + 2], a: pixels[index + 3] };
		} else {
			return { r: pixels[index], g: pixels[index + 1], b: pixels[index + 2] };
		}
	};

	function calculateColorDistance(color1, color2) {
		// 计算三维距离
		if (("a" in color1 && color1.a === 0) || ("a" in color2 && color2.a === 0)) {
			return 0;
		}
		const r1 = color1.r, g1 = color1.g, b1 = color1.b;
		const r2 = color2.r, g2 = color2.g, b2 = color2.b;
		const distance = Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2));
		return distance;
	}

	function shuffleArray(array) {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}
	}

	async function loadBoard() {
		// 加载绘版上的错误像素
		for (let y = 0; y < 600; y++) {
			for (let x = 0; x < 1000; x++) {
				if (x < xL || x > xR) continue;
				if (y < yL || y > yR) continue;
				const pixel = board[y][x];
				const realPixel = getPixelAt(x - xL, y - yL);
				if (calculateColorDistance(pixel, realPixel) <= info.sim) continue;
				pointQueue.push({ x: x - xL, y: y - yL });
			}
		}
	}

	processAttack = async (x, y, r, g, b) => {
		if (x < xL || x > xR) return;
		if (y < yL || y > yR) return;
		let realX = x - startX, realY = y - startY;
		const realPixel = { r, g, b };
		const correctPixel = getPixelAt(realX, realY);
		if (calculateColorDistance(realPixel, correctPixel) <= info.sim) {
			return;
		}
		// const tk = await getNextToken();
		// paint(tk.uid, tk.token, correctPixel.r, correctPixel.g, correctPixel.b, x, y);
		attackCnt++;
	}

	function getRandomInt(min, max) {
		min = Math.ceil(min);
		max = Math.floor(max);
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	function processStop() {
		queuePos = 0;
		queueTotal = 0;
		isDrawing = false; // 停止任务
		info.imagePath = null;
		info.startX = null;
		info.startY = null;
		broadcastLog('绘画任务已停止。');
	}

	const drawTask = async () => {
		if (stopDrawing) {
			processStop();
			return;
		}
		await loadBoard();
		if (info.strategy.order === 'random') shuffleArray(pointQueue);
		if (info.strategy.priority === 'alpha' && channels === 4) {
			pointQueue.sort((a, b) => getPixelAt(b.x, b.y).a - getPixelAt(a.x, a.y).a);
		}
		broadcastLog(`队列已刷新，目前队列长度: ${pointQueue.length}。`);
		queueTotal = pointQueue.length;
		queuePos = 0;
		for (let pos of pointQueue) {
			const pixel = getPixelAt(pos.x, pos.y);
			const tk = await getNextToken();
			paint(tk.uid, tk.token, pixel.r, pixel.g, pixel.b, pos.x + startX, pos.y + startY);
			if (stopDrawing) {
				processStop();
				return;
			}
			queuePos += 1;
		}
		if (pointQueue.length <= info.fmax) {
			broadcastLog(`压力过小，等待中...`);
			await delay(3000);
		}
		pointQueue = [];
		setImmediate(drawTask); // 重新启动绘画任务
	};
	drawTask();
}

// 启动绘画任务 API
app.post('/api/start-draw', async (req, res) => {
	const { imageName, startX, startY } = req.body;

	if (ws.readyState !== WebSocket.OPEN || !status) {
		return res.status(400).send('WebSocket 未连接');
	}

	if (isDrawing) {
		return res.status(400).send('存在正在执行的绘画任务。');
	}

	if (fTokens.length == 0) {
		return res.status(400).send('请先加载 Token。');
	}

	const imagePath = path.join(UPLOAD_DIR, imageName);
	if (!fs.existsSync(imagePath)) {
		return res.status(404).send('找不到对应图像。');
	}

	lstPath = imagePath, lstStartX = startX, lstStartY = startY;
	try {
		await SdrawTask(imagePath, startX, startY);
		res.json({ message: '绘画任务已启动。' });
	} catch (e) {
		return res.status(500).send('内部服务器错误。');
	}
});

// 停止绘画任务 API
app.post('/api/stop-draw', (req, res) => {
	if (!isDrawing) {
		return res.status(400).send('没有正在执行的绘画任务。');
	}
	processAttack = null;
	stopDrawing = true;
	pointQueue = [];
	res.json({ message: '正在停止绘画任务。' });
});

server.listen(PORT, () => {
	console.log(`日志 WS 地址: ws://localhost:${PORT}`);
});

app.listen(WEBPORT, () => {
	console.log(`Web 地址: http://localhost:${WEBPORT}`);
});

reportServer.listen(DRAWPORT, () => {
	console.log(`信息 WS 地址: ws://localhost:${DRAWPORT}`);
});
