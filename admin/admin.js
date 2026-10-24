(() => {
    const fileInput = document.getElementById('photoFiles');
    const filenameInput = document.getElementById('filename');
    const startNumberInput = document.getElementById('startNumber');
    const targetInput = document.getElementById('targetKB');
    const qualityInput = document.getElementById('quality');
    const qualityValue = document.getElementById('qualityValue');
    const convertButton = document.getElementById('convertButton');
    const status = document.getElementById('status');
    const result = document.getElementById('result');
    const batchSummary = document.getElementById('batchSummary');
    const photoResults = document.getElementById('photoResults');
    const downloadZipButton = document.getElementById('downloadZip');
    let selectedFiles = [];
    let convertedPhotos = [];
    let working = false;

    function slugify(value) {
        return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function setStatus(message, isError = false) {
        status.textContent = message;
        status.classList.toggle('is-error', isError);
    }

    function releasePhotos() {
        convertedPhotos.forEach(photo => URL.revokeObjectURL(photo.url));
        convertedPhotos = [];
    }

    function makeFileName(index) {
        const prefix = slugify(filenameInput.value) || 'photo';
        const start = Math.max(1, Number.parseInt(startNumberInput.value, 10) || 1);
        return `${prefix}-${String(start + index).padStart(2, '0')}.webp`;
    }

    function addResultCard(photo) {
        const card = document.createElement('article');
        card.className = 'admin-photo-card';
        const image = document.createElement('img');
        image.src = photo.url;
        image.alt = '';
        image.loading = 'lazy';
        const details = document.createElement('div');
        details.className = 'admin-photo-details';
        const name = document.createElement('strong');
        name.textContent = photo.name;
        const info = document.createElement('span');
        info.textContent = `${photo.width} × ${photo.height}px · ${formatBytes(photo.blob.size)}${photo.withinTarget ? '' : ' · over target'}`;
        const link = document.createElement('a');
        link.className = 'btn btn-outline-gold';
        link.href = photo.url;
        link.download = photo.name;
        link.innerHTML = '<i class="fa-solid fa-download" aria-hidden="true"></i> Download';
        details.append(name, info, link);
        card.append(image, details);
        photoResults.append(card);
    }

    function crc32(bytes) {
        let crc = 0xffffffff;
        for (const byte of bytes) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    function makeZip(files) {
        const encoder = new TextEncoder();
        const localParts = [];
        const centralParts = [];
        let localOffset = 0;
        const now = new Date();
        const zipTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
        const zipDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

        for (const file of files) {
            const nameBytes = encoder.encode(file.name);
            const data = new Uint8Array(file.bytes);
            const checksum = crc32(data);
            const local = new Uint8Array(30 + nameBytes.length);
            const localView = new DataView(local.buffer);
            localView.setUint32(0, 0x04034b50, true);
            localView.setUint16(4, 20, true);
            localView.setUint16(6, 0x0800, true);
            localView.setUint16(8, 0, true);
            localView.setUint16(10, zipTime, true);
            localView.setUint16(12, zipDate, true);
            localView.setUint32(14, checksum, true);
            localView.setUint32(18, data.length, true);
            localView.setUint32(22, data.length, true);
            localView.setUint16(26, nameBytes.length, true);
            localView.setUint16(28, 0, true);
            local.set(nameBytes, 30);
            localParts.push(local, data);

            const central = new Uint8Array(46 + nameBytes.length);
            const centralView = new DataView(central.buffer);
            centralView.setUint32(0, 0x02014b50, true);
            centralView.setUint16(4, 20, true);
            centralView.setUint16(6, 20, true);
            centralView.setUint16(8, 0x0800, true);
            centralView.setUint16(10, 0, true);
            centralView.setUint16(12, zipTime, true);
            centralView.setUint16(14, zipDate, true);
            centralView.setUint32(16, checksum, true);
            centralView.setUint32(20, data.length, true);
            centralView.setUint32(24, data.length, true);
            centralView.setUint16(28, nameBytes.length, true);
            centralView.setUint16(30, 0, true);
            centralView.setUint16(32, 0, true);
            centralView.setUint16(34, 0, true);
            centralView.setUint16(36, 0, true);
            centralView.setUint32(38, 0, true);
            centralView.setUint32(42, localOffset, true);
            central.set(nameBytes, 46);
            centralParts.push(central);
            localOffset += local.length + data.length;
        }

        const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
        const end = new Uint8Array(22);
        const endView = new DataView(end.buffer);
        endView.setUint32(0, 0x06054b50, true);
        endView.setUint16(4, 0, true);
        endView.setUint16(6, 0, true);
        endView.setUint16(8, files.length, true);
        endView.setUint16(10, files.length, true);
        endView.setUint32(12, centralSize, true);
        endView.setUint32(16, localOffset, true);
        endView.setUint16(20, 0, true);
        return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
    }

    fileInput.addEventListener('change', () => {
        selectedFiles = Array.from(fileInput.files || []).filter(file => file.type.startsWith('image/'));
        convertButton.disabled = !selectedFiles.length || working;
        result.hidden = true;
        releasePhotos();
        photoResults.replaceChildren();
        const rejectedCount = fileInput.files.length - selectedFiles.length;
        if (!selectedFiles.length) {
            setStatus('Choose one or more supported image files to get started.', rejectedCount > 0);
            return;
        }
        const suffix = rejectedCount ? ` ${rejectedCount} unsupported file(s) were skipped.` : '';
        setStatus(`${selectedFiles.length} photo(s) selected in file picker order.${suffix}`);
    });

    qualityInput.addEventListener('input', () => {
        qualityValue.value = `${qualityInput.value}%`;
        qualityValue.textContent = `${qualityInput.value}%`;
    });

    convertButton.addEventListener('click', async () => {
        if (!selectedFiles.length || working) return;
        const targetKB = Number(targetInput.value);
        const startNumber = Number(startNumberInput.value);
        if (!Number.isInteger(targetKB) || targetKB < 50 || targetKB > 2000) {
            targetInput.focus();
            setStatus('Enter a target file size from 50 to 2000 KB.', true);
            return;
        }
        if (!Number.isInteger(startNumber) || startNumber < 1 || startNumber + selectedFiles.length - 1 > 999999) {
            startNumberInput.focus();
            setStatus('Choose a starting number that leaves room for the entire batch (1 to 999999).', true);
            return;
        }

        working = true;
        convertButton.disabled = true;
        result.hidden = true;
        releasePhotos();
        photoResults.replaceChildren();
        let originalBytes = 0;

        try {
            for (let index = 0; index < selectedFiles.length; index += 1) {
                const file = selectedFiles[index];
                setStatus(`Converting photo ${index + 1} of ${selectedFiles.length}: ${file.name}`);
                const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
                const limitingDimension = image.width > image.height ? image.height : image.width;
                const initialScale = Math.min(1, 1080 / limitingDimension);
                const minimumScale = Math.min(initialScale, 320 / limitingDimension);
                const targetBytes = targetKB * 1024;
                let scale = initialScale;
                let quality = Number(qualityInput.value) / 100;
                let width = Math.max(1, Math.round(image.width * scale));
                let height = Math.max(1, Math.round(image.height * scale));
                let blob = null;
                const canvas = document.createElement('canvas');

                for (let attempt = 0; attempt < 40; attempt += 1) {
                    width = Math.max(1, Math.round(image.width * scale));
                    height = Math.max(1, Math.round(image.height * scale));
                    canvas.width = width;
                    canvas.height = height;
                    const context = canvas.getContext('2d', { alpha: true });
                    if (!context) throw new Error(`Could not prepare ${file.name} on this browser.`);
                    context.drawImage(image, 0, 0, width, height);
                    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
                    if (!blob) throw new Error(`Could not convert ${file.name}.`);
                    if (blob.type !== 'image/webp') throw new Error('This browser does not support WebP conversion. Try a recent version of Chrome, Edge, Firefox, or Safari.');
                    if (blob.size <= targetBytes) break;

                    if (scale > minimumScale) {
                        scale = Math.max(minimumScale, scale * 0.9);
                    } else if (quality > 0.45) {
                        quality = Math.max(0.45, quality - 0.07);
                    } else {
                        break;
                    }
                }
                canvas.width = 0;
                canvas.height = 0;
                image.close();

                const photo = { name: makeFileName(index), blob, url: URL.createObjectURL(blob), width, height, withinTarget: blob.size <= targetBytes };
                convertedPhotos.push(photo);
                originalBytes += file.size;
                addResultCard(photo);
            }

            const outputBytes = convertedPhotos.reduce((total, photo) => total + photo.blob.size, 0);
            const reduction = Math.max(0, Math.round((1 - outputBytes / originalBytes) * 100));
            const overTarget = convertedPhotos.filter(photo => !photo.withinTarget).length;
            batchSummary.textContent = `${convertedPhotos.length} photo(s) · ${formatBytes(originalBytes)} → ${formatBytes(outputBytes)} · ${reduction}% smaller in total${overTarget ? ` · ${overTarget} could not reach the ${targetKB} KB target` : ` · all at or below ${targetKB} KB`}`;
            result.hidden = false;
            setStatus('Batch ready. Download individual files or the ZIP, then upload the WebP files to the photos folder.');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Could not convert the selected photos.', true);
            if (convertedPhotos.length) {
                batchSummary.textContent = `${convertedPhotos.length} of ${selectedFiles.length} photo(s) converted before the error.`;
                result.hidden = false;
            }
        } finally {
            working = false;
            convertButton.disabled = !selectedFiles.length;
        }
    });

    downloadZipButton.addEventListener('click', async () => {
        if (!convertedPhotos.length) return;
        downloadZipButton.disabled = true;
        downloadZipButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Building ZIP…';
        try {
            const files = await Promise.all(convertedPhotos.map(async photo => ({ name: photo.name, bytes: await photo.blob.arrayBuffer() })));
            const zip = makeZip(files);
            const zipUrl = URL.createObjectURL(zip);
            const link = document.createElement('a');
            link.href = zipUrl;
            link.download = `${slugify(filenameInput.value) || 'photos'}-webp.zip`;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);
        } catch {
            setStatus('Could not create the ZIP file. Download the converted photos individually instead.', true);
        } finally {
            downloadZipButton.disabled = false;
            downloadZipButton.innerHTML = '<i class="fa-solid fa-file-zipper" aria-hidden="true"></i> Download all as ZIP';
        }
    });

    window.addEventListener('beforeunload', releasePhotos);
})();
