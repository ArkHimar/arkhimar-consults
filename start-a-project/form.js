const form = document.querySelector('#brief-form');
const statusBox = document.querySelector('#form-status');
const attachmentInput = document.querySelector('#attachments');
const attachmentList = document.querySelector('#attachment-list');
const attachmentError = document.querySelector('#attachment-error');
const maxUploadBytes = 10 * 1024 * 1024;
const allowedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx', 'dwg', 'dxf']);

const formatSize = bytes => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function validateAttachments() {
  const files = [...attachmentInput.files];
  const invalid = files.find(file => !allowedExtensions.has(file.name.split('.').pop()?.toLowerCase()));
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  attachmentError.textContent = invalid
    ? `${invalid.name} is not a supported file type.`
    : totalBytes > maxUploadBytes
      ? `Attachments total ${formatSize(totalBytes)}. Please keep the combined size at or below 10 MB.`
      : '';

  attachmentInput.setCustomValidity(attachmentError.textContent);
  attachmentList.innerHTML = files.length
    ? `<ul>${files.map(file => `<li><span>${file.name.replace(/[&<>"']/g, '')}</span><span>${formatSize(file.size)}</span></li>`).join('')}</ul><p>${files.length} file${files.length === 1 ? '' : 's'} · ${formatSize(totalBytes)} total</p>`
    : '<p>No files selected</p>';

  return !attachmentError.textContent;
}

attachmentInput?.addEventListener('change', validateAttachments);

form?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!validateAttachments() || !form.reportValidity()) return;

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  statusBox.className = 'form-status visible';
  statusBox.textContent = 'Sending your project brief and attachments…';

  try {
    const response = await fetch('https://formsubmit.co/ajax/projects@arkhimar.com', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new FormData(form)
    });
    if (!response.ok) throw new Error('Request failed');
    form.reset();
    validateAttachments();
    statusBox.textContent = 'Thank you. Your project brief and attachments have been received. Our team will be in touch.';
  } catch (error) {
    statusBox.className = 'form-status visible error';
    statusBox.innerHTML = 'We could not send your brief right now. Please email <a href="mailto:projects@arkhimar.com">projects@arkhimar.com</a> directly.';
  } finally {
    button.disabled = false;
    statusBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});
