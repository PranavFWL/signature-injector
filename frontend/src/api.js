export async function uploadPdf(file) {
  const form = new FormData();
  form.append("pdf", file);

  const res = await fetch("http://localhost:5000/upload", {
    method: "POST",
    body: form,
  });

  return res.json();
}

export async function signPdf(pdfId, fields) {
  const res = await fetch("http://localhost:5000/sign-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdfId, fields }),
  });

  const data = await res.json();
  return data.signedId;
}

export async function downloadPdf(id) {
  const res = await fetch(`http://localhost:5000/download/${id}`);
  const blob = await res.blob();

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "signed.pdf";
  link.click();
}
