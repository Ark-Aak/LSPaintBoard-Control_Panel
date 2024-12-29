document.addEventListener('DOMContentLoaded', async () => {
	const canvas = document.getElementById('heatmap');
	const context = canvas.getContext('2d');
	canvas.width = 1000;
	canvas.height = 600;
	const gridSize = 20;
	const rows = 30;
	const cols = 50;
	const gridColors = Array.from({
		length: rows
	}, () => Array(cols).fill('#000000'));
	let selectedCells = [];
	let lx = -1, ly = -1, rx = -1, ry = -1;
	function drawGrid() {
		if (lx == -1 || ly == -1)
			$('#first').text('左上坐标: 未选中');
		else
			$('#first').text(`左上坐标: (${lx}, ${ly})`);
		if (rx == -1 || ry == -1)
			$('#second').text('右下坐标: 未选中');
		else
			$('#second').text(`右下坐标: (${rx}, ${ry})`);
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) {
				context.fillStyle = gridColors[row][col];
				context.fillRect(col * gridSize, row * gridSize, gridSize, gridSize);
				context.strokeStyle = '#cccccc';
				context.strokeRect(col * gridSize, row * gridSize, gridSize, gridSize);
			}
		}
		if (selectedCells.length === 1) {
			const { row, col } = selectedCells[0];
			context.fillStyle = 'rgba(255, 165, 0, 0.4)';
			context.fillRect(col * gridSize, row * gridSize, gridSize, gridSize);
		} else if (selectedCells.length === 2) {
			const startRow = Math.min(selectedCells[0].row, selectedCells[1].row);
			const endRow = Math.max(selectedCells[0].row, selectedCells[1].row);
			const startCol = Math.min(selectedCells[0].col, selectedCells[1].col);
			const endCol = Math.max(selectedCells[0].col, selectedCells[1].col);

			for (let row = startRow; row <= endRow; row++) {
				for (let col = startCol; col <= endCol; col++) {
					if (row == startRow || row == endRow)
						context.fillStyle = 'rgba(255, 165, 0, 0.4)';
					else if (col == startCol || col == endCol)
						context.fillStyle = 'rgba(255, 165, 0, 0.4)';
					else
						context.fillStyle = 'rgba(255, 165, 0, 0.2)';
					context.fillRect(col * gridSize, row * gridSize, gridSize, gridSize);
				}
			}
		}
	}

	function setCellColor(row, col, color) {
		if (row >= 0 && row < rows && col >= 0 && col < cols) {
			gridColors[row][col] = color;
		}
	}

	canvas.addEventListener('click', (event) => {
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width; // X轴缩放比例
		const scaleY = canvas.height / rect.height; // Y轴缩放比例
		const x = (event.clientX - rect.left) * scaleX; // 修正后的 X 坐标
		const y = (event.clientY - rect.top) * scaleY; // 修正后的 Y 坐标
		const col = Math.floor(x / gridSize);
		const row = Math.floor(y / gridSize);
		if (selectedCells.length < 2) {
			selectedCells.push({ row, col });
			if (selectedCells.length === 1) {
				ly = selectedCells[0].row * gridSize;
				lx = selectedCells[0].col * gridSize;
			} else {
				ly = Math.min(selectedCells[0].row, selectedCells[1].row) * gridSize;
				lx = Math.min(selectedCells[0].col, selectedCells[1].col) * gridSize;
				ry = Math.max(selectedCells[0].row + 1, selectedCells[1].row + 1) * gridSize - 1;
				rx = Math.max(selectedCells[0].col + 1, selectedCells[1].col + 1) * gridSize - 1;
			}
		} else {
			selectedCells[1] = {
				row,
				col
			};
			ly = Math.min(selectedCells[0].row, selectedCells[1].row) * gridSize;
			lx = Math.min(selectedCells[0].col, selectedCells[1].col) * gridSize;
			ry = Math.max(selectedCells[0].row + 1, selectedCells[1].row + 1) * gridSize - 1;
			rx = Math.max(selectedCells[0].col + 1, selectedCells[1].col + 1) * gridSize - 1;
		}
		drawGrid();
	});

	canvas.addEventListener('contextmenu', (event) => {
		event.preventDefault();
		selectedCells = [];
		lx = -1, ly = -1, rx = -1, ry = -1;
		drawGrid();
	});

	drawGrid();

	const reportSocket = new WebSocket(`ws://${window.location.hostname}:3002`);
	reportSocket.onmessage = (event) => {
		const data = JSON.parse(event.data);
		if (data.type !== 'heatlist') return;
		const points = data.data;
		for (let point of points) {
			setCellColor(point[1], point[0],
				`#${point[2].toString(16).padStart(2, '0')}${point[3].toString(16).padStart(2, '0')}${point[4].toString(16).padStart(2, '0')}`
			);
		}
		drawGrid();
	};

	let time = 0;

	$('#time').range({
		min: 0,
		max: 600,
		start: 30,
		step: 10,
		onChange: function (value) {
			const timeValue = document.getElementById('timeValue');
			timeValue.innerText = `查询时间 (${value}s)`;
			time = value;
		}
	});

	$('#query').click(async () => {
		await fetch('/queryheat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ time, lx, ly, rx, ry }),
		}).then(data => data.text()).then((cnt) => {
			const result = document.getElementById('result');
			$('#result_div').show();
			result.innerText = `近 ${time}s 在选中区域中进行了 ${cnt} 次绘画。`;
		});
	});
});