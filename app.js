/* ─────────────────────────────────────────
   76 PDF Suite — app.js (Full Logic)
   ───────────────────────────────────────── */

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const { PDFDocument, rgb, degrees, StandardFonts } = PDFLib;

let mergeFiles = [];
let imgToPdfFiles = [];
let currentSingleFile = null;

// Editor State
let editorOriginalPdfBytes = null;
let editorActivePageIndex = null; 

function getOutputName(fileOrFiles, suffix, extension = "pdf") {
    let baseName = "Document";
    if (Array.isArray(fileOrFiles) && fileOrFiles.length > 0) {
        baseName = fileOrFiles[0].name.replace(/\.[^/.]+$/, "");
    } else if (fileOrFiles && fileOrFiles.name) {
        baseName = fileOrFiles.name.replace(/\.[^/.]+$/, "");
    }
    return `${baseName}_${suffix}.${extension}`;
}

function showPanel(panelId) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('panel-' + panelId);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.remove('active');
        if (nav.getAttribute('data-panel') === panelId) nav.classList.add('active');
    });
    closeSidebar();
    window.scrollTo(0, 0);
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('visible');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('visible');
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => showPanel(btn.getAttribute('data-panel')));
    });
    document.querySelectorAll('.tool-card').forEach(card => {
        card.addEventListener('click', () => showPanel(card.getAttribute('data-goto')));
    });

    document.getElementById('hamburger-btn').addEventListener('click', toggleSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

    setupMergeLogic();
    setupSplitLogic();
    setupImgToPdfLogic();
    setupPdfToImgLogic();
    setupWatermarkLogic();
    setupMetadataLogic();
    setupEditorLogic();
    setupSignatureModal();

    showPanel('home');
});

function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show ' + type;
    setTimeout(() => { t.className = ''; }, 3000);
}

function updateProgress(id, percent, label = '') {
    const wrap = document.getElementById(id + '-progress');
    const bar = document.getElementById(id + '-bar');
    const lbl = document.getElementById(id + '-progress-label');
    if (percent === 0) wrap.classList.remove('visible');
    else wrap.classList.add('visible');
    bar.style.width = percent + '%';
    if (label && lbl) lbl.textContent = label;
}

function download(data, name, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}

// --- STANDARD TOOLS ---
function setupMergeLogic() {
    const input = document.getElementById('merge-input');
    const list = document.getElementById('merge-file-list');
    input.addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(f => { if (f.type === 'application/pdf') mergeFiles.push(f); });
        renderMergeList();
    });
    new Sortable(list, { animation: 150, onEnd: (evt) => {
        const item = mergeFiles.splice(evt.oldIndex, 1)[0];
        mergeFiles.splice(evt.newIndex, 0, item);
    }});
    document.getElementById('btn-merge').addEventListener('click', async () => {
        if (mergeFiles.length < 2) return showToast("Select at least 2 PDFs", "error");
        updateProgress('merge', 10);
        try {
            const mergedPdf = await PDFDocument.create();
            for (let i = 0; i < mergeFiles.length; i++) {
                const bytes = await mergeFiles[i].arrayBuffer();
                const pdf = await PDFDocument.load(bytes);
                const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                pages.forEach(p => mergedPdf.addPage(p));
                updateProgress('merge', 10 + ((i + 1) / mergeFiles.length) * 80);
            }
            const pdfBytes = await mergedPdf.save();
            download(pdfBytes, getOutputName(mergeFiles, "Merge"), "application/pdf");
            updateProgress('merge', 100); setTimeout(() => updateProgress('merge', 0), 2000);
        } catch (err) { showToast("Error merging PDFs", "error"); updateProgress('merge', 0); }
    });
}
function renderMergeList() {
    const list = document.getElementById('merge-file-list');
    list.innerHTML = '';
    mergeFiles.forEach((f, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="drag-handle">☰</span><span class="fn">${f.name}</span><button class="rm" onclick="removeMergeFile(${i})">✕</button>`;
        list.appendChild(li);
    });
}
window.removeMergeFile = (i) => { mergeFiles.splice(i, 1); renderMergeList(); };

function setupSplitLogic() {
    document.getElementById('split-input').addEventListener('change', (e) => {
        currentSingleFile = e.target.files[0];
        if (currentSingleFile) { document.getElementById('split-fname').textContent = currentSingleFile.name; document.getElementById('split-info').classList.add('visible'); }
    });
    document.getElementById('btn-split').addEventListener('click', async () => {
        if (!currentSingleFile) return showToast("Select a PDF", "error");
        const interval = parseInt(document.getElementById('split-interval').value) || 1;
        updateProgress('split', 20);
        try {
            const zip = new JSZip();
            const bytes = await currentSingleFile.arrayBuffer();
            const sourcePdf = await PDFDocument.load(bytes);
            const pageCount = sourcePdf.getPageCount();
            for (let i = 0; i < pageCount; i += interval) {
                const newPdf = await PDFDocument.create();
                const end = Math.min(i + interval, pageCount);
                const indices = Array.from({length: end - i}, (_, k) => i + k);
                const pages = await newPdf.copyPages(sourcePdf, indices);
                pages.forEach(p => newPdf.addPage(p));
                const splitBytes = await newPdf.save();
                zip.file(`split_part_${Math.floor(i/interval) + 1}.pdf`, splitBytes);
            }
            const zipBlob = await zip.generateAsync({type: "blob"});
            download(zipBlob, getOutputName(currentSingleFile, "Split", "zip"), "application/zip");
            updateProgress('split', 100); setTimeout(() => updateProgress('split', 0), 2000);
        } catch (err) { showToast("Error splitting PDF", "error"); updateProgress('split', 0); }
    });
}

function setupImgToPdfLogic() {
    document.getElementById('img-input').addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(f => imgToPdfFiles.push(f)); renderImgList();
    });
    document.getElementById('btn-img-to-pdf').addEventListener('click', async () => {
        if (imgToPdfFiles.length === 0) return showToast("Select images", "error");
        updateProgress('img', 10);
        try {
            const pdfDoc = await PDFDocument.create();
            for (const f of imgToPdfFiles) {
                const imgBytes = await f.arrayBuffer();
                let img = (f.type === 'image/jpeg') ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);
                const page = pdfDoc.addPage([img.width, img.height]);
                page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
            }
            const bytes = await pdfDoc.save();
            download(bytes, getOutputName(imgToPdfFiles, "ImageToPDF"), "application/pdf");
            updateProgress('img', 100); setTimeout(() => updateProgress('img', 0), 2000);
        } catch (err) { showToast("Error converting images", "error"); updateProgress('img', 0); }
    });
}
function renderImgList() {
    const list = document.getElementById('img-file-list'); list.innerHTML = '';
    imgToPdfFiles.forEach((f, i) => {
        list.innerHTML += `<li><span class="fn">${f.name}</span><button class="rm" onclick="removeImg(${i})">✕</button></li>`;
    });
}
window.removeImg = (i) => { imgToPdfFiles.splice(i, 1); renderImgList(); };

function setupPdfToImgLogic() {
    document.getElementById('p2i-input').addEventListener('change', (e) => {
        currentSingleFile = e.target.files[0];
        if(currentSingleFile) { document.getElementById('p2i-fname').textContent = currentSingleFile.name; document.getElementById('p2i-info').classList.add('visible'); }
    });
    document.querySelectorAll('.option-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            e.target.parentElement.querySelectorAll('.option-pill').forEach(p => p.classList.remove('selected'));
            e.target.classList.add('selected');
        });
    });
    document.getElementById('btn-p2i').addEventListener('click', async () => {
        if (!currentSingleFile) return showToast("Select a PDF", "error");
        updateProgress('p2i', 10);
        try {
            const format = document.querySelector('.option-pill.selected[data-fmt]')?.dataset.fmt || 'jpg';
            const zip = new JSZip();
            const bytes = await currentSingleFile.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({data: bytes}).promise;
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2 });
                const canvas = document.createElement('canvas');
                canvas.height = viewport.height; canvas.width = viewport.width;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                zip.file(`page_${i}.${format}`, canvas.toDataURL(`image/${format === 'jpg' ? 'jpeg' : 'png'}`).split(',')[1], {base64: true});
            }
            const zipBlob = await zip.generateAsync({type: "blob"});
            download(zipBlob, getOutputName(currentSingleFile, "PDFtoImage", "zip"), "application/zip");
            updateProgress('p2i', 100); setTimeout(() => updateProgress('p2i', 0), 2000);
        } catch (err) { showToast("Conversion failed", "error"); updateProgress('p2i', 0); }
    });
}

function setupWatermarkLogic() {
    document.getElementById('watermark-input').addEventListener('change', (e) => {
        currentSingleFile = e.target.files[0];
        if(currentSingleFile) { document.getElementById('wm-fname').textContent = currentSingleFile.name; document.getElementById('wm-info').classList.add('visible'); }
    });
    document.getElementById('btn-watermark').addEventListener('click', async () => {
        const text = document.getElementById('watermark-text').value;
        if (!currentSingleFile || !text) return showToast("Select PDF and enter text", "error");
        updateProgress('wm', 30);
        try {
            const bytes = await currentSingleFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(bytes);
            const helvetica = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            const opacity = parseFloat(document.getElementById('watermark-opacity').value);
            pdfDoc.getPages().forEach(page => {
                const { width, height } = page.getSize();
                page.drawText(text, { x: width/4, y: height/2, size: 50, font: helvetica