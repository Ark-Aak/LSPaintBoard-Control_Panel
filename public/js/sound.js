class AudioPlayer {
	constructor(audioFiles) {
		this.audioFiles = audioFiles; // 存储音频文件路径
		this.audioObjects = []; // 存储预加载的 Audio 对象
		this.currentIndex = 0; // 当前播放的音频索引
		this.playlist = []; // 要播放的下标数组
		this.isPlaying = false;
		this.playFlag = false;
		this.preloadAudio();
	}

	preloadAudio() {
		this.audioFiles.forEach((file, index) => {
			const audio = new Audio(file);
			audio.preload = 'auto';
			this.audioObjects[index] = audio;
			console.log(`音频预加载完成: ${file}`);
		});
	}

	playSingle(index) {
		if (index >= 0 && index < this.audioObjects.length) {
			const audio = this.audioObjects[index];
			audio.currentTime = 0;
			if (this.playFlag === true) {
				audio.play();
				this.isPlaying = true;
				audio.onended = () => {
					this.currentIndex++;
					if (this.currentIndex < this.playlist.length) {
						this.playSingle(this.playlist[this.currentIndex]);
					} else {
						this.isPlaying = false;
					}
				};
			}
		} else {
			console.error(`无效的音频索引：${index}`);
		}
	}

	play(indexArray) {
		if (!this.isPlaying) {
			this.currentIndex = 0;
			this.playlist = [];
		}
		const lists = indexArray.filter((index) => index >= 0 && index < this.audioFiles.length);
		for (let audio of lists) this.playlist.push(audio);
		if (this.playlist.length === 0) return;
		if (!this.isPlaying) this.playSingle(this.playlist[this.currentIndex]);
	}

	stop() {
		if (this.isPlaying) {
			const currentAudio = this.audioObjects[this.playlist[this.currentIndex]];
			currentAudio.pause();
			currentAudio.currentTime = 0;
		}
		this.isPlaying = false;
	}
}

const audioFiles = [
	'audio/cancelled.mp3',
	'audio/in_progress.mp3',
	'audio/our_base_is_under_attack.mp3',
	'audio/warning.wav',
	'audio/repairing.mp3',
	'audio/click.wav'
];

const player = new AudioPlayer(audioFiles);

document.addEventListener('click', () => {
	if (player.playFlag === false) {
		player.playFlag = true;
		toastr.success('音频模块已启动', '成功');
	}
});
document.addEventListener('touchend', () => {
	if (player.playFlag === false) {
		player.playFlag = true;
		toastr.success('音频模块已启动', '成功');
	}
});

document.addEventListener('click', (event) => {
	player.stop();
	player.play([ 5 ]);
});