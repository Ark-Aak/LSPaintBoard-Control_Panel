document.addEventListener('DOMContentLoaded', async () => {
	const logsContainer = document.getElementById('logs');
	const fetchTokenForm = document.getElementById('fetchTokenForm');
	const readTokensBtn = document.getElementById('readTokensBtn');
	const uploadImageForm = document.getElementById('uploadImageForm');
	const imagePath = document.getElementById('imagePath');
	const tokenList = document.getElementById('tokenList');
	$('#hideHeatmap').click(() => {
		$('#heatmap').toggle();
	});
	$("#paintProgress").progress({ percent: 0 });
	const logSocket = new WebSocket(`ws://${window.location.hostname}:3000`);
	logSocket.onmessage = (event) => {
		addLog(event.data);
	};
	const reportSocket = new WebSocket(`ws://${window.location.hostname}:3002`);
	const ctx = document.getElementById('lineChart').getContext('2d');
	let chartdata = {
		labels: [-30, -27, -24, -21, -18, -15, -12, -9, -6, -3, 0],
		datasets: [
			{
				label: '着色速率',
				borderColor: 'rgb(75, 192, 192)',
				backgroundColor: 'rgba(75, 192, 192, 0.2)',
				data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				fill: false,
				tension: 0.4
			},
			{
				label: '压力大小',
				borderColor: 'rgb(255, 166, 0)',
				backgroundColor: 'rgba(255, 166, 0, 0.2)',
				data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				fill: false,
				tension: 0.4
			},
			{
				label: '绘画速率',
				borderColor: 'rgb(255, 81, 0)',
				backgroundColor: 'rgba(255, 81, 0, 0.2)',
				data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				fill: false,
				tension: 0.4
			}
		]
	};
	const config = {
		type: 'line',
		data: chartdata,
		options: {
			scales: {
				x: {
					title: {
						display: true,
						text: '时间 (s)',
					},
					type: 'linear',
					position: 'bottom',
					ticks: {
						callback: function (value, index, values) {
							return -value + " 秒前";
						}
					}
				},
				y: {
					min: 0
				}
			},
			responsive: true,
			plugins: {
				tooltip: {
					enabled: true,
					backgroundColor: 'rgba(0, 0, 0, 0.7)',
					callbacks: {
						title: function (tooltipItems) {
							const label = tooltipItems[0].label;
							return -parseInt(label) + " 秒前";
						},
						label: function (tooltipItem) {
							const datasetIndex = tooltipItem.datasetIndex;
							const value = tooltipItem.raw;
							if (datasetIndex === 0) {
								return '着色速率：' + value + " px/s";
							}
							else if (datasetIndex === 1) {
								return '压力大小：' + value + " px/s";
							}
							else if (datasetIndex === 2) {
								return '绘画速率：' + value + " px/s";
							}
						}
					},
				},
			},
		},
	};
	const chart = new Chart(ctx, config);
	function updateData(id, val) {
		while (chartdata.datasets[id].data.length > 10) chartdata.datasets[id].data.shift();
		chartdata.datasets[id].data.push(val);
	}
	reportSocket.onmessage = (event) => {
		const data = JSON.parse(event.data);
		if (data.type !== 'data_view') return;
		const paintRate = parseFloat(data.paintRate.toFixed(2));
		const attackRate = parseFloat(data.attackRate.toFixed(2));
		const recieveRate = parseFloat(data.recieveRate.toFixed(2));
		const coloredRate = parseFloat(data.coloredRate.toFixed(2));
		const buffer = data.buffer;
		const queueTotal = data.queueTotal;
		const queuePos = data.queuePos;
		if (attackRate > 0 && coloredRate > 1 && attackRate >= coloredRate) {
			toastr.warning(`压力超过绘画速度，压力 ${attackRate} px/s`, '警告');
			player.play([3, 2]);
		}
		document.getElementById('paintRate').innerText = `绘画速率： ${paintRate} px/s`;
		document.getElementById('coloredRate').innerText = `着色速度： ${coloredRate} px/s`;
		document.getElementById('attackRate').innerText = `压力大小： ${attackRate} px/s`;
		document.getElementById('recieveRate').innerText = `应答速率： ${recieveRate} req/s`;
		document.getElementById('wsBuffer').innerText = `缓冲大小： ${buffer} B`;
		document.getElementById('paintProgressTitle').innerText = `绘画进度 (${queuePos}/${queueTotal})`;
		const paintedRate = queueTotal ? (queuePos / queueTotal * 100.0) : 0;
		$("#paintProgress").progress({ percent: paintedRate });
		updateData(0, coloredRate);
		updateData(1, attackRate);
		updateData(2, paintRate);
		chart.update();
	};

	// Function to add a log entry
	function addLog(message) {
		const logItem = document.createElement('div');
		logItem.className = 'item';
		logItem.textContent = message;
		if (logsContainer.children.length > 50) logsContainer.replaceChildren()
		logsContainer.appendChild(logItem);
		logsContainer.scrollTop = logsContainer.scrollHeight;
	}

	// Fetch and populate images
	async function fetchImages() {
		try {
			const response = await fetch('/api/images');
			if (response.ok) {
				const images = await response.json();
				imagePath.innerHTML = '<option value="" disabled selected>选择图像...</option>';
				images.forEach((image) => {
					const option = document.createElement('option');
					option.value = image;
					option.textContent = image;
					imagePath.appendChild(option);
				});
			}
			else {
				addLog(`图片列表获取失败，状态码: ${response.status}。`);
			}
		} catch (error) {
			addLog('图片列表获取失败。');
			console.error(error);
		}
	}

	let initalData;

	async function getInfo() {
		if (initalData) return initalData;
		initalData = (await fetch('/api/getinfo')).json();
		return initalData;
	}

	async function fetchTokens() {
		try {
			const response = await fetch('/api/tokens');
			if (response.ok) {
				const tokens = await response.json();
				tokenList.innerHTML = '';
				tokens.forEach((token) => {
					const item = document.createElement('div');
					item.className = 'item';
					item.textContent = `${token.token}#${token.uid}`;
					tokenList.appendChild(item);
				});
				const tokenCount = document.getElementById('tokenCount');
				tokenCount.innerText = `Tokens (${tokens.length})`;
				$('#slider-token').range({
					min: 1,          // 最小值
					max: tokens.length,        // 最大值
					start: (await getInfo()).fmax,
					step: 1,         // 步长
					onChange: async function (value) {
						const tokenUsed = document.getElementById('tokenUsing');
						tokenUsed.innerText = `Token 投入数量 (${value})`;
						await fetch('/api/fmax', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ val: value }),
						});
					}
				});
			}
			else {
				addLog(`获取 Token 列表失败，状态码: ${response.status}。`);
			}
		} catch (error) {
			addLog('获取 Token 列表失败。');
			console.error(error);
		}
	}

	fetchTokenForm.addEventListener('submit', async (e) => {
		e.preventDefault();
		const uid = document.getElementById('uid').value;
		const paste = document.getElementById('paste').value;
		document.getElementById('uid').value = ""
		document.getElementById('paste').value = ""
		try {
			const response = await fetch('/api/paintboard/token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ uid, paste }),
			});
			if (response.ok) {
				const data = await response.json();
				addLog(`已添加 Token: ${data.data.token}#${uid}。`);
				fetchTokens();
			}
			else {
				addLog(`Token 获取失败，状态码: ${response.status}。`);
			}
		} catch (error) {
			addLog('Token 获取失败。');
			console.error(error);
		}
	});

	uploadImageForm.addEventListener('submit', async (e) => {
		e.preventDefault();
		const formData = new FormData(uploadImageForm);
		try {
			const response = await fetch('/api/upload-image', {
				method: 'POST',
				body: formData,
			});
			if (response.ok) {
				const data = await response.json();
				if (data.message) {
					addLog(data.message);
					return;
				}
				addLog(`图像上传成功，大小: ${data.width}x${data.height}。`);
				await fetchImages(); // 更新图片列表
			}
			else {
				addLog(`图像上传失败，状态码: ${response.status}。`);
			}
		} catch (error) {
			addLog('图像上传失败。');
			console.error(error);
		}
	});

	fetchImages();
	fetchTokens();

	readTokensBtn.addEventListener('click', fetchTokens); // 刷新 token 列表
	const startDrawForm = document.getElementById('startDrawForm');

	startDrawForm.addEventListener('submit', async (e) => {
		e.preventDefault();
		const startX = parseInt(document.getElementById('startX').value);
		const startY = parseInt(document.getElementById('startY').value);
		const imageName = document.getElementById('imagePath').value;

		if (startX < 0 || startX > 1000 || startY < 0 || startY > 600 || !imageName) {
			addLog('无效的图像或起始坐标。');
			return;
		}
		try {
			const response = await fetch('/api/start-draw', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ imageName, startX, startY }),
			});
			if (response.ok) {
				const data = await response.json();
				player.play([4]);
				addLog(data.message);
			}
			else {
				addLog(`绘画任务启动失败，状态码: ${response.status}。`);
				if (response.status === 401) player.play([1]);
			}
		} catch (error) {
			addLog('绘画任务启动失败。');
			console.error(error);
		}
	});
	const stopDrawingButton = document.getElementById('stopDrawingButton');

	stopDrawingButton.addEventListener('click', async (e) => {
		e.preventDefault();
		try {
			const response = await fetch('/api/stop-draw', {
				method: 'POST',
			});
			if (response.ok) {
				const data = await response.json();
				player.play([0]);
				addLog(data.message);
			}
			else {
				player.play([1]);
				addLog(`绘画任务停止失败，状态码: ${response.status}。`);
			}
		} catch (error) {
			addLog('绘画任务停止失败。');
			console.error(error);
		}
	});

	const refreshImageButton = document.getElementById('refreshImage');
	refreshImageButton.addEventListener('click', async (e) => {
		e.preventDefault();
		await fetchImages();
	});

	$('#slider-sim').range({
		min: 0,
		max: 20,
		start: (await getInfo()).sim,
		step: 0.05,
		onChange: async function (value) {
			const simValue = document.getElementById('simValue');
			simValue.innerText = `相似度阈值 (${value})`;
			await fetch('/api/sim', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ val: value }),
			});
		}
	});

	$('#slider-mod').range({
		min: 0,
		max: 60000,
		start: (await getInfo()).mod,
		step: 1000,
		onChange: async function (value) {
			const simValue = document.getElementById('modValue');
			simValue.innerText = `绘版 CD (${value})`;
			await fetch('/api/mod', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ val: value }),
			});
		}
	});

	function bindStrategyApi(name) {
		$("#strategy_" + name).on('change', async (event) => {
			const val = event.target.value;
			await fetch('/api/strategy/' + name, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ val })
			});
		});
	}

	bindStrategyApi('cd');
	bindStrategyApi('order');
	bindStrategyApi('priority');

	async function initStrategySelect(name) {
		const val = (await getInfo());
		$('#strategy_' + name).val(val.strategy[name]);
		$('#strategy_' + name).trigger('change');
	}

	await initStrategySelect('cd');
	await initStrategySelect('order');
	await initStrategySelect('priority');

	async function initInputBox(name) {
		$('#' + name).val((await getInfo())[name]);
		$('#' + name).trigger('change');
	}

	initInputBox('imagePath');
	initInputBox('startX');
	initInputBox('startY');
});