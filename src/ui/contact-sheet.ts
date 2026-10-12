export interface ContactFrame { image: CanvasImageSource; label: string; }

export function makeContactSheet(frames: readonly (CanvasImageSource | ContactFrame)[], width = 1080, height = 1350): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Contact sheet canvas is unavailable');
  context.fillStyle = '#1b1e24'; context.fillRect(0, 0, width, height);
  const marginX = width * 0.06; const marginY = height * 0.07; const gap = width * 0.025;
  const cellWidth = (width - marginX * 2 - gap * 2) / 3;
  const cellHeight = (height - marginY * 2 - gap * 2) / 3;
  for (let index = 0; index < 9; index++) {
    const x = marginX + (index % 3) * (cellWidth + gap);
    const y = marginY + Math.floor(index / 3) * (cellHeight + gap);
    context.fillStyle = '#e8e4da'; context.fillRect(x, y, cellWidth, cellHeight);
    const selected = frames[index] ?? frames.at(-1);
    const frame = selected && 'image' in selected ? selected.image : selected;
    if (frame) {
      const source = frame as CanvasImageSource & { width?: number; height?: number; videoWidth?: number; videoHeight?: number };
      const sourceWidth = source.videoWidth ?? source.width ?? cellWidth;
      const sourceHeight = source.videoHeight ?? source.height ?? cellHeight;
      const scale = Math.max(cellWidth / sourceWidth, cellHeight / sourceHeight);
      const drawWidth = sourceWidth * scale; const drawHeight = sourceHeight * scale;
      context.save(); context.beginPath(); context.rect(x, y, cellWidth, cellHeight); context.clip();
      context.drawImage(frame, x + (cellWidth - drawWidth) / 2, y + (cellHeight - drawHeight) / 2, drawWidth, drawHeight);
      context.restore();
    }
    context.strokeStyle = '#e8e4da'; context.lineWidth = 3; context.strokeRect(x, y, cellWidth, cellHeight);
    context.fillStyle = '#232323'; context.font = `${Math.round(width * 0.012)}px monospace`; context.fillText(String(index + 1).padStart(2, '0'), x + 8, y + 18);
    if (selected && 'label' in selected) {
      if (selected.label.toLowerCase().includes('close call')) {
        context.strokeStyle = '#ffdc73'; context.lineWidth = 5;
        context.beginPath(); context.ellipse(x + cellWidth * 0.58, y + cellHeight * 0.48, cellWidth * 0.17, cellHeight * 0.14, -0.18, 0, Math.PI * 2); context.stroke();
      }
      if (selected.label.toLowerCase().includes('fatal')) {
        context.strokeStyle = '#ff4b3e'; context.lineWidth = 8;
        context.beginPath(); context.moveTo(x + cellWidth * 0.68, y + cellHeight * 0.1); context.lineTo(x + cellWidth * 0.9, y + cellHeight * 0.32); context.moveTo(x + cellWidth * 0.9, y + cellHeight * 0.1); context.lineTo(x + cellWidth * 0.68, y + cellHeight * 0.32); context.stroke();
      }
      context.fillStyle = 'rgba(20, 20, 20, 0.78)'; context.fillRect(x, y + cellHeight - 24, cellWidth, 24);
      context.fillStyle = '#fff'; context.font = `bold ${Math.round(width * 0.012)}px monospace`; context.fillText(selected.label.toUpperCase(), x + 8, y + cellHeight - 8);
    }
  }
  context.fillStyle = '#e8e4da';
  for (let y = marginY; y < height - marginY; y += 22) {
    context.beginPath(); context.arc(marginX * 0.42, y, 4, 0, Math.PI * 2); context.arc(width - marginX * 0.42, y, 4, 0, Math.PI * 2); context.fill();
  }
  context.fillStyle = '#ff4b3e'; context.font = `bold ${Math.round(width * 0.04)}px sans-serif`; context.fillText('CULL', marginX, height - marginY * 0.3);
  return canvas;
}
