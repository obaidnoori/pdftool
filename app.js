/* ─────────────────────────────────────────
   76 PDF Suite — Safe Logic Engine
   ───────────────────────────────────────── */

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const { PDFDocument, rgb, degrees, StandardFonts } = PDFLib;

let mergeFiles = [];
let imgToPdfFiles = [];
let currentSingleFile = null;
let editorOriginalPdfBytes = null;
let editorActivePageIndex = null;

// Safe Native DOM Node Interface
function safeDOM(id, property, value, action = 'set') {
    const el = document.getElementById(id);
    if (!el) return null;
    if (action === 'set') {
        if (property === 'textContent') el.textContent = value;
        else if (property === 'style.display') el.style.display = value;
        else el[property] = value;
    }
    return el;
}

function showPanel(panelId) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const activePanel = document.getElementById(`panel-${panelId}`);
    if (activePanel) activePanel.classList.add('active');
    
    const activeNav = document.querySelector(`.nav-item[data-panel="${panelId}"]`);
    if (activeNav) activeNav.classList.add('active');
    
    safeDOM('topbar-title', 'textContent', panelId.toUpperCase());
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('visible');
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => showPanel(btn.getAttribute('data-panel')));
    });

    const hamburger = document.getElementById('hamburger-btn');
    if (hamburger) {
        hamburger.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
            document.getElementById('sidebar-overlay').classList.toggle('visible');
        });
    }

    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
        overlay.addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
            overlay.classList.remove('visible');
        });
    }

    setupMergeLogic();
    setupSplitLogic();
    setupImgToPdfLogic();
    setupPdfToImgLogic();
    setupWatermarkLogic();
    setupMetadataLogic();
    setupEditorLogic();
    setupSignatureModal();
});

// --- CORE UTILITY MANAGEMENT ---
function download(data, name, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
}

// --- STANDARD TOOLS FUNCTION MATRIX ---
function setupMergeLogic() {
    const input = document.getElementById('merge-input');
    if (!input) return;
    input.addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(f => { if(f.type === 'application/pdf') mergeFiles.push(f); });
        const list = document.getElementById('merge-file-list');
        if (list) {
            list.innerHTML = '';
            mergeFiles.forEach((f, idx) => {
                const li = document.createElement('li');
                li.style.padding = "6px";
                li.textContent = `${idx + 1}. ${f.name}`;
                list.appendChild(li);
            });
        }
    });
    const btn = document.getElementById('btn-merge');
    if(btn) {
        btn.addEventListener('click', async () => {
            if (mergeFiles.length < 2) return alert("Select multiple PDF targets.");
            const doc = await PDFDocument.create();
            for (const file of mergeFiles) {
                const src = await PDFDocument.load(await file.arrayBuffer());
                const pages = await doc.copyPages(src, src.getPageIndices());
                pages.forEach(p => doc.addPage(p));
            }
            download(await doc.save(), "Merged_Document.pdf", "application/pdf");
        });
    }
}

function setupSplitLogic() {
    const input = document.getElementById('split-input');
    if (!input) return;
    input.addEventListener('change', (e) => {
        currentSingleFile = e.target.files[0];
        if (currentSingleFile) {
            safeDOM('split-fname', 'textContent', currentSingleFile.name);
            safeDOM('split-info', 'style.display', 'flex');
        }
    });
    const btn = document.getElementById('btn-split');
    if(btn) {
        btn.addEventListener('click', async () => {
            if(!currentSingleFile) return;
            const step = parseInt(document.getElementById('split-interval').value) || 1;
            const zip = new JSZip();
            const src = await PDFDocument.load(await currentSingleFile.arrayBuffer());
            const total = src.getPageCount();
            for (let i = 0; i < total; i += step) {
                const segment = await PDFDocument.create();
                const range = Array.from({length: Math.min(step, total - i)}, (_, k) => i + k);
                const pages = await segment.copyPages(src, range);
                pages.forEach(p => segment.addPage(p));
                zip.file(`Segment_${Math.floor(i/step) + 1}.pdf`, await segment.save());
            }
            download(await zip.generateAsync({type:"blob"}), "Splits_Archive.zip", "application/zip");
        });
    }
}

function setupImgToPdfLogic() {
    const input = document.getElementById('img-input');
    if (!input) return;
    input.addEventListener('change', (e) => { imgToPdfFiles = Array.from(e.target.files); });
    const btn = document.getElementById('btn-img-to-pdf');
    if(btn) {
        btn.addEventListener('click', async () => {
            if(imgToPdfFiles.length === 0) return;
            const doc = await PDFDocument.create();
            for(const f of imgToPdfFiles) {
                const data = await f.arrayBuffer();
                const embed = f.type === 'image/jpeg' ? await doc.embedJpg(data) : await doc.embedPng(data);
                const page = doc.addPage([embed.width, embed.height]);
                page.drawImage(embed, {x:0, y:0, width:embed.width, height:embed.height});
            }
            download(await doc.save(), "ImageCompiled.pdf", "application/pdf");
        });
    }
}

function setupPdfToImgLogic() {
    const input = document.getElementById('p2i-input');
    if(!input) return;
    input.addEventListener('change', (e) => {
        currentSingleFile = e.target.files[0];
        if (currentSingleFile) {
            safeDOM('p2i-fname', 'textContent', currentSingleFile.name);
            safeDOM('p2i-info', 'style.display', 'flex');
        }
    });
    const btn = document.getElementById('btn-p2i');
    if(btn) {
        btn.addEventListener('click', async () => {
            if(!currentSingleFile) return;
            const zip = new JSZip();
            const target = await pdfjsLib.getDocument({data: await currentSingleFile.arrayBuffer()}).promise;
            for(let i=1; i<=target.numPages; i++) {
                const page = await target.getPage(i);
                const view = page.getViewport({scale: 1.5});
                const canvas = document.createElement('canvas');
                canvas.width = view.width; canvas.height = view.height;
                await page.render({canvasContext: canvas.getContext('2d'), viewport: view}).promise;
                const data = canvas.toDataURL('image/jpeg').split(',')[1];
                zip.file(`Page_${i}.jpg`, data, {base64: true});
            }
            download(await zip.generateAsync({type:"blob"}), "PDF_Images.zip", "application/zip");
        });
    }
}

function setupWatermarkLogic() {
    const input = document.getElementById('watermark-input');
    if(!input) return;
    input.addEventListener('change', (e) => {
        currentSingleFile = e.target.files[0];
        if (currentSingleFile) {
            safeDOM('wm-fname', 'textContent', currentSingleFile.name);
            safeDOM('wm-info', 'style.display', 'flex');
        }
    });
    const btn = document.getElementById('btn-watermark');
    if(btn) {
        btn.addEventListener('click', async () => {
            const txt = document.getElementById('watermark-text').value || "CONFIDENTIAL";
            if(!currentSingleFile) return;
            const doc = await PDFDocument.load(await currentSingleFile.arrayBuffer());
            const font = await doc.embedFont(StandardFonts.HelveticaBold);
            doc.getPages().forEach(p => {
                const { width, height } = p.getSize();
                p.drawText(txt, { x: width/4, y: height/2, size: 44, font: font, color: rgb(0.7,0.7,0.7), rotate: degrees(45), opacity: 0.3 });
            });
            download(await doc.save(), "Watermarked.pdf", "application/pdf");
        });
    }
}

function setupMetadataLogic() {
    const input = document.getElementById('meta-input');
    if(!input) return;
    input.addEventListener('change', (e) => {
        currentSingleFile = e.target.files[0];
        if (currentSingleFile) {
            safeDOM('meta-fname', 'textContent', currentSingleFile.name);
            safeDOM('meta-info', 'style.display', 'flex');
        }
    });
    const btn = document.getElementById('btn-metadata');
    if(btn) {
        btn.addEventListener('click', async () => {
            if(!currentSingleFile) return;
            const doc = await PDFDocument.load(await currentSingleFile.arrayBuffer());
            doc.setTitle(document.getElementById('meta-title').value || "");
            doc.setAuthor(document.getElementById('meta-author').value || "");
            download(await doc.save(), "MetaUpdated.pdf", "application/pdf");
        });
    }
}

// --- MODULAR WORKSPACE INTERACTIVE EDITOR ENGINE ---
function setupEditorLogic() {
    const input = document.getElementById('editor-upload');
    const container = document.getElementById('editor-pages-container');
    if(!input || !container) return;

    new Sortable(container, { handle: '.overlay-drag-handle', animation: 150 });

    input.addEventListener('change', async (e) => {
        currentSingleFile = e.target.files[0];
        if (!currentSingleFile) return;

        safeDOM('editor-launch-card', 'style.display', 'none');
        safeDOM('editor-ui', 'style.display', 'block');
        safeDOM('editor-fname', 'textContent', currentSingleFile.name);
        container.innerHTML = '<p style="padding:20px; text-align:center;">Rendering Workspace Assets...</p>';

        try {
            editorOriginalPdfBytes = await currentSingleFile.arrayBuffer();
            const target = await pdfjsLib.getDocument({data: editorOriginalPdfBytes}).promise;
            container.innerHTML = '';

            for (let i = 1; i <= target.numPages; i++) {
                const page = await target.getPage(i);
                const view = page.getViewport({ scale: 1.2 });

                const block = document.createElement('div');
                block.className = 'editor-page-block';
                block.dataset.index = (i - 1);

                const toolbar = document.createElement('div');
                toolbar.className = 'editor-page-toolbar';
                toolbar.innerHTML = `
                    <span class="overlay-drag-handle">✥ Page ${i}</span>
                    <div>
                        <button class="btn-primary" style="padding:4px 8px; font-size:12px; margin-right:5px;" onclick="addTextTrack(this)">+ Text</button>
                        <button class="btn-primary" style="padding:4px 8px; font-size:12px; margin-right:5px; background:#475569;" onclick="openSigTrack(${i-1})">✒ Sign</button>
                        <button class="btn-primary" style="padding:4px 8px; font-size:12px; background:#ef4444;" onclick="this.closest('.editor-page-block').remove()">🗑 Drop</button>
                    </div>
                `;

                const wrap = document.createElement('div');
                wrap.className = 'editor-canvas-wrap';
                wrap.style.width = `${view.width}px`;
                wrap.style.height = `${view.height}px`;

                const canvas = document.createElement('canvas');
                canvas.width = view.width; canvas.height = view.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport: view }).promise;

                wrap.appendChild(canvas);
                block.appendChild(toolbar);
                block.appendChild(wrap);
                container.appendChild(block);
            }
        } catch (err) { container.innerHTML = '<p style="color:red; padding:20px;">Render Execution Fault.</p>'; }
    });

    document.getElementById('editor-clear').addEventListener('click', () => {
        safeDOM('editor-launch-card', 'style.display', 'block');
        safeDOM('editor-ui', 'style.display', 'none');
        container.innerHTML = '';
        input.value = '';
    });

    document.getElementById('btn-editor-save').addEventListener('click', async () => {
        const blocks = document.querySelectorAll('.editor-page-block');
        if (blocks.length === 0) return;

        const src = await PDFDocument.load(editorOriginalPdfBytes);
        const out = await PDFDocument.create();
        const font = await out.embedFont(StandardFonts.Helvetica);

        for (const b of blocks) {
            const baseIdx = parseInt(b.dataset.index);
            const [copied] = await out.copyPages(src, [baseIdx]);
            out.addPage(copied);

            const wrap = b.querySelector('.editor-canvas-wrap');
            const rect = wrap.getBoundingClientRect();
            const pdfW = copied.getWidth();
            const pdfH = copied.getHeight();
            const rx = pdfW / rect.width;
            const ry = pdfH / rect.height;

            // Type processing pass
            wrap.querySelectorAll('.editor-text-overlay').forEach(t => {
                const area = t.querySelector('textarea');
                if(!area || !area.value) return;
                const rBox = t.getBoundingClientRect();
                const x = (rBox.left - rect.left) * rx;
                const hPdf = rBox.height * ry;
                const y = (rect.height - (rBox.top - rect.top)) * ry - hPdf;

                copied.drawText(area.value, { x: x + 4, y: y + 4, size: 14 * ry, font: font, color: rgb(0,0,0) });
            });

            // Sign processing pass
            const sigs = wrap.querySelectorAll('.editor-sig-overlay img');
            for (const img of sigs) {
                const rBox = img.parentElement.getBoundingClientRect();
                const x = (rBox.left - rect.left) * rx;
                const hPdf = rBox.height * ry;
                const y = (rect.height - (rBox.top - rect.top)) * ry - hPdf;
                const embed = await out.embedPng(await fetch(img.src).then(r => r.arrayBuffer()));
                copied.drawImage(embed, { x, y, width: rBox.width * rx, height: hPdf });
            }
        }
        download(await out.save(), "Edited_Workspace.pdf", "application/pdf");
    });
}

window.addTextTrack = (btn) => {
    const wrap = btn.closest('.editor-page-block').querySelector('.editor-canvas-wrap');
    const box = document.createElement('div');
    box.className = 'editor-text-overlay';
    box.style.left = '40px'; box.style.top = '40px';
    box.innerHTML = `<div class="overlay-drag-handle" style="font-size:9px; padding:1px 3px;">Move</div><textarea placeholder="Type text..." style="color:black;"></textarea>`;
    wrap.appendChild(box);
    bindDrag(box);
};

window.openSigTrack = (idx) => {
    editorActivePageIndex = idx;
    safeDOM('sig-modal-overlay', 'style.display', 'flex');
};

function bindDrag(el) {
    const handle = el.querySelector('.overlay-drag-handle');
    let active = false, ox, oy;
    handle.addEventListener('mousedown', (e) => {
        active = true; ox = e.clientX - el.offsetLeft; oy = e.clientY - el.offsetTop;
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!active) return;
        el.style.left = `${e.clientX - ox}px`; el.style.top = `${e.clientY - oy}px`;
    });
    document.addEventListener('mouseup', () => active = false);
}

function setupSignatureModal() {
    const canvas = document.getElementById('sig-canvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let draw = false;

    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#000000';

    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX || e.touches[0].clientX) - r.left, y: (e.clientY || e.touches[0].clientY) - r.top };
    };

    canvas.addEventListener('mousedown', (e) => { draw = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('mousemove', (e) => { if(!draw) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    document.addEventListener('mouseup', () => draw = false);

    document.getElementById('sig-clear').addEventListener('click', () => ctx.clearRect(0, 0, canvas.width, canvas.height));
    document.getElementById('sig-cancel').addEventListener('click', () => safeDOM('sig-modal-overlay', 'style.display', 'none'));
    
    document.getElementById('sig-save').addEventListener('click', () => {
        const url = canvas.toDataURL('image/png');
        const blocks = document.querySelectorAll('.editor-page-block');
        let targetWrap = null;
        blocks.forEach(b => { if(parseInt(b.dataset.index) === editorActivePageIndex) targetWrap = b.querySelector('.editor-canvas-wrap'); });
        
        if(targetWrap) {
            const box = document.createElement('div');
            box.className = 'editor-sig-overlay';
            box.style.left = '60px'; box.style.top = '60px';
            box.innerHTML = `<div class="overlay-drag-handle" style="font-size:9px; padding:1px 3px;">Move</div><img src="${url}" style="width:120px; display:block;">`;
            targetWrap.appendChild(box);
            bindDrag(box);
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        safeDOM('sig-modal-overlay', 'style.display', 'none');
    });
}
