const MEDIABUNNY_URL = 'https://cdn.jsdelivr.net/npm/mediabunny@1.61.3/+esm';

const $ = (id) => document.getElementById(id);
const state = {
  file: null,
  kind: null,
  width: 0,
  height: 0,
  duration: null,
  ratio: 1.33,
  geometry: 'width',
  sourceUrl: null,
  outputUrl: null,
  outputFile: null,
  conversion: null,
  mediabunny: null,
};

const els = {
  fileInput: $('fileInput'), dropZone: $('dropZone'), filePanel: $('filePanel'), previewPanel: $('previewPanel'),
  fileName: $('fileName'), mediaType: $('mediaType'), sourceSize: $('sourceSize'), fileSize: $('fileSize'),
  clearButton: $('clearButton'), sourceStage: $('sourceStage'), correctedStage: $('correctedStage'),
  ratioGrid: $('ratioGrid'), customRatioWrap: $('customRatioWrap'), customRatio: $('customRatio'),
  geometryInput: $('geometryInput'), geometryOutput: $('geometryOutput'), aspectOutput: $('aspectOutput'),
  videoOptions: $('videoOptions'), photoOptions: $('photoOptions'), videoCodec: $('videoCodec'), videoQuality: $('videoQuality'),
  photoFormat: $('photoFormat'), jpegQuality: $('jpegQuality'), jpegQualityValue: $('jpegQualityValue'), jpegQualityRow: $('jpegQualityRow'),
  memoryWarning: $('memoryWarning'), processButton: $('processButton'), processLabel: $('processLabel'), cancelButton: $('cancelButton'),
  progressWrap: $('progressWrap'), progressBar: $('progressBar'), progressText: $('progressText'), progressPercent: $('progressPercent'),
  resultCard: $('resultCard'), resultName: $('resultName'), resultMeta: $('resultMeta'), downloadButton: $('downloadButton'), shareButton: $('shareButton'),
  runtimeRow: $('runtimeRow'),
};

function reportCapabilities() {
  const caps = [
    ['WebCodecs', 'VideoEncoder' in window && 'VideoDecoder' in window],
    ['Canvas', !!document.createElement('canvas').getContext],
    ['Web Share', 'share' in navigator],
    ['PWA', 'serviceWorker' in navigator],
  ];
  els.runtimeRow.replaceChildren(...caps.map(([name, ok]) => {
    const span = document.createElement('span');
    span.className = `capability ${ok ? 'ok' : 'no'}`;
    span.textContent = name;
    return span;
  }));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : n >= 100 ? 0 : n >= 10 ? 1 : 2)} ${units[i]}`;
}

function even(n) { return Math.max(2, Math.round(n / 2) * 2); }

function getTargetGeometry() {
  if (!state.width || !state.height) return { width: 0, height: 0 };
  return state.geometry === 'width'
    ? { width: even(state.width), height: even(state.height / state.ratio) }
    : { width: even(state.width * state.ratio), height: even(state.height) };
}

function updateGeometry() {
  if (!state.width || !state.height) {
    els.geometryInput.textContent = '—';
    els.geometryOutput.textContent = '選檔後計算';
    els.aspectOutput.textContent = '—';
    return;
  }
  const target = getTargetGeometry();
  els.geometryInput.textContent = `${state.width} × ${state.height} · ${state.ratio.toFixed(2)}×`;
  els.geometryOutput.textContent = `${target.width} × ${target.height}`;
  els.aspectOutput.textContent = `≈ ${(target.width / target.height).toFixed(2)}:1`;
  els.correctedStage.style.aspectRatio = `${target.width} / ${target.height}`;
}

function setRatio(ratio) {
  state.ratio = ratio;
  [...els.ratioGrid.querySelectorAll('.ratio-button')].forEach(btn => {
    const v = btn.dataset.ratio;
    btn.classList.toggle('active', v === 'custom' ? false : Number(v) === ratio);
  });
  updateGeometry();
}

function cleanupUrls() {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
  state.sourceUrl = null;
  state.outputUrl = null;
}

function resetResult() {
  if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
  state.outputUrl = null;
  state.outputFile = null;
  els.resultCard.hidden = true;
  els.shareButton.hidden = true;
}

function resetApp() {
  if (state.conversion?.state === 'executing') state.conversion.cancel().catch(() => {});
  cleanupUrls();
  Object.assign(state, { file: null, kind: null, width: 0, height: 0, duration: null, outputFile: null, conversion: null });
  els.fileInput.value = '';
  els.filePanel.hidden = true;
  els.previewPanel.hidden = true;
  els.videoOptions.hidden = true;
  els.photoOptions.hidden = true;
  els.processButton.disabled = true;
  els.processLabel.textContent = '先選擇媒體';
  els.sourceStage.replaceChildren();
  els.correctedStage.replaceChildren();
  els.resultCard.hidden = true;
  els.progressWrap.hidden = true;
  updateGeometry();
}

async function loadMediabunny() {
  if (state.mediabunny) return state.mediabunny;
  state.mediabunny = await import(MEDIABUNNY_URL);
  return state.mediabunny;
}

async function inspectImage(file) {
  const bitmap = await createImageBitmap(file);
  try {
    state.width = bitmap.width;
    state.height = bitmap.height;
  } finally {
    bitmap.close?.();
  }
}

async function inspectVideo(file) {
  if (!('VideoEncoder' in window) || !('VideoDecoder' in window)) {
    throw new Error('這個瀏覽器沒有 WebCodecs VideoEncoder / VideoDecoder。請更新 Safari / iOS。');
  }
  const { Input, ALL_FORMATS, BlobSource } = await loadMediabunny();
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  if (!(await input.canRead())) throw new Error('目前無法辨識這個影片容器。');
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('檔案中找不到影片軌。');
  if (!(await track.canDecode())) throw new Error('瀏覽器無法解碼這支影片的 codec。');
  state.width = await track.getDisplayWidth();
  state.height = await track.getDisplayHeight();
  state.duration = await input.getDurationFromMetadata() ?? null;
}

function buildPreview() {
  state.sourceUrl = URL.createObjectURL(state.file);
  els.sourceStage.replaceChildren();
  els.correctedStage.replaceChildren();
  const makeMedia = () => {
    if (state.kind === 'photo') {
      const img = new Image();
      img.src = state.sourceUrl;
      img.alt = 'selected media preview';
      return img;
    }
    const video = document.createElement('video');
    video.src = state.sourceUrl;
    video.controls = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    return video;
  };
  els.sourceStage.append(makeMedia());
  els.correctedStage.append(makeMedia());
  els.sourceStage.style.aspectRatio = `${state.width} / ${state.height}`;
  updateGeometry();
}

async function handleFile(file) {
  if (!file) return;
  resetApp();
  state.file = file;
  state.kind = file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name) ? 'photo' : file.type.startsWith('video/') || /\.(mov|mp4|m4v)$/i.test(file.name) ? 'video' : null;
  if (!state.kind) {
    alert('請選擇照片或影片檔案。');
    resetApp();
    return;
  }
  els.processButton.disabled = true;
  els.processLabel.textContent = '讀取媒體資訊…';
  try {
    if (state.kind === 'photo') await inspectImage(file); else await inspectVideo(file);
    els.fileName.textContent = file.name;
    els.mediaType.textContent = state.kind === 'photo' ? 'Photo' : 'Video';
    els.sourceSize.textContent = `${state.width} × ${state.height}`;
    els.fileSize.textContent = formatBytes(file.size);
    els.memoryWarning.hidden = !(state.kind === 'video' && file.size > 100 * 1024 * 1024);
    els.filePanel.hidden = false;
    els.previewPanel.hidden = false;
    els.videoOptions.hidden = state.kind !== 'video';
    els.photoOptions.hidden = state.kind !== 'photo';
    buildPreview();
    els.processLabel.textContent = state.kind === 'photo' ? '輸出校正照片' : '開始 Desqueeze';
    els.processButton.disabled = false;
  } catch (err) {
    console.error(err);
    alert(`無法讀取：${err.message || err}`);
    resetApp();
  }
}

function setProgress(progress, text = '處理中…') {
  const p = Math.max(0, Math.min(1, progress));
  els.progressWrap.hidden = false;
  els.progressBar.style.width = `${(p * 100).toFixed(1)}%`;
  els.progressPercent.textContent = `${Math.round(p * 100)}%`;
  els.progressText.textContent = text;
}

function outputBaseName() {
  return state.file.name.replace(/\.[^.]+$/, '') + `_desqueeze-${state.ratio.toFixed(2)}x`;
}

async function processPhoto() {
  setProgress(0.08, '解碼照片…');
  const bitmap = await createImageBitmap(state.file);
  const { width, height } = getTargetGeometry();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  setProgress(0.42, '進行幾何校正…');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const mime = els.photoFormat.value;
  const quality = mime === 'image/jpeg' ? Number(els.jpegQuality.value) / 100 : undefined;
  setProgress(0.72, '編碼輸出…');
  const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('瀏覽器無法輸出所選圖片格式。')), mime, quality));
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `${outputBaseName()}.${ext}`, { type: mime });
}

async function pickVideoCodec(mb, width, height) {
  const selected = els.videoCodec.value;
  const candidates = selected === 'auto' ? ['hevc', 'avc'] : [selected];
  const codec = await mb.getFirstEncodableVideoCodec(candidates, { width, height });
  if (!codec) {
    throw new Error(selected === 'auto'
      ? `這個瀏覽器沒有可用的 HEVC/H.264 encoder，或 ${width}×${height} 超出編碼能力。`
      : `目前無法用 ${selected.toUpperCase()} 編碼 ${width}×${height}。`);
  }
  return codec;
}

async function processVideo() {
  const mb = await loadMediabunny();
  const { Input, Output, Conversion, ALL_FORMATS, BlobSource, Mp4OutputFormat, BufferTarget, Quality } = mb;
  const { width, height } = getTargetGeometry();
  setProgress(0.01, '檢查編碼能力…');
  const codec = await pickVideoCodec(mb, width, height);
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(state.file) });
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  setProgress(0.03, `${codec === 'hevc' ? 'HEVC' : 'H.264'} · 建立轉檔流程…`);
  const conversion = await Conversion.init({
    input,
    output,
    tracks: 'primary',
    video: {
      width,
      height,
      fit: 'fill',
      codec,
      quality: new Quality(els.videoQuality.value),
      hardwareAcceleration: 'prefer-hardware',
      forceTranscode: true,
    },
  });
  state.conversion = conversion;
  if (!conversion.isValid) {
    const detail = conversion.discardedTracks?.map(x => x.reason || x).join('; ');
    throw new Error(`無法建立有效輸出${detail ? `：${detail}` : ''}`);
  }
  conversion.onProgress = (p) => setProgress(Math.max(.03, p), `${codec === 'hevc' ? 'HEVC' : 'H.264'} · 本機處理中…`);
  await conversion.execute();
  if (!target.buffer) throw new Error('轉檔完成但沒有取得輸出資料。');
  return new File([target.buffer], `${outputBaseName()}.mp4`, { type: 'video/mp4' });
}

async function showResult(file) {
  resetResult();
  state.outputFile = file;
  state.outputUrl = URL.createObjectURL(file);
  els.downloadButton.href = state.outputUrl;
  els.downloadButton.download = file.name;
  els.resultName.textContent = file.name;
  els.resultMeta.textContent = `${formatBytes(file.size)} · ${getTargetGeometry().width} × ${getTargetGeometry().height}`;
  els.resultCard.hidden = false;
  if (navigator.share && navigator.canShare?.({ files: [file] })) els.shareButton.hidden = false;
}

async function processCurrent() {
  if (!state.file) return;
  resetResult();
  els.processButton.disabled = true;
  els.cancelButton.hidden = state.kind !== 'video';
  setProgress(0, '準備中…');
  try {
    const output = state.kind === 'photo' ? await processPhoto() : await processVideo();
    setProgress(1, '完成');
    await showResult(output);
  } catch (err) {
    if (err?.name === 'ConversionCanceledError' || /cancel/i.test(err?.message || '')) {
      setProgress(0, '已取消');
    } else {
      console.error(err);
      setProgress(0, '失敗');
      alert(`處理失敗：${err.message || err}`);
    }
  } finally {
    state.conversion = null;
    els.cancelButton.hidden = true;
    els.processButton.disabled = false;
  }
}

els.fileInput.addEventListener('change', () => handleFile(els.fileInput.files?.[0]));
els.clearButton.addEventListener('click', resetApp);
els.dropZone.addEventListener('dragover', e => { e.preventDefault(); els.dropZone.classList.add('dragging'); });
els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('dragging'));
els.dropZone.addEventListener('drop', e => {
  e.preventDefault(); els.dropZone.classList.remove('dragging');
  handleFile(e.dataTransfer?.files?.[0]);
});
els.ratioGrid.addEventListener('click', e => {
  const btn = e.target.closest('.ratio-button');
  if (!btn) return;
  const value = btn.dataset.ratio;
  [...els.ratioGrid.querySelectorAll('.ratio-button')].forEach(b => b.classList.toggle('active', b === btn));
  els.customRatioWrap.hidden = value !== 'custom';
  if (value === 'custom') setRatio(Number(els.customRatio.value)); else setRatio(Number(value));
  if (value === 'custom') btn.classList.add('active');
});
els.customRatio.addEventListener('input', () => {
  const v = Math.min(3, Math.max(1.01, Number(els.customRatio.value) || 1.33));
  state.ratio = v; updateGeometry();
});
document.querySelectorAll('input[name="geometry"]').forEach(radio => radio.addEventListener('change', () => {
  state.geometry = document.querySelector('input[name="geometry"]:checked').value;
  updateGeometry();
}));
els.photoFormat.addEventListener('change', () => { els.jpegQualityRow.hidden = els.photoFormat.value !== 'image/jpeg'; });
els.jpegQuality.addEventListener('input', () => { els.jpegQualityValue.textContent = els.jpegQuality.value; });
els.processButton.addEventListener('click', processCurrent);
els.cancelButton.addEventListener('click', async () => {
  els.cancelButton.disabled = true;
  try { await state.conversion?.cancel(); } finally { els.cancelButton.disabled = false; }
});
els.shareButton.addEventListener('click', async () => {
  if (!state.outputFile) return;
  try { await navigator.share({ files: [state.outputFile], title: 'OpenDeSqueeze output' }); }
  catch (err) { if (err?.name !== 'AbortError') alert(`分享失敗：${err.message || err}`); }
});

reportCapabilities();
updateGeometry();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.warn));
}
