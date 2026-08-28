"use client";

import { useEffect } from "react";

type PhotoEntry = { url: string; updatedAt: string };
type PhotoIndex = Record<string, PhotoEntry>;

function normalisePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("0") && digits.length === 10 ? `260${digits.slice(1)}` : digits;
}

function phoneFromText(text: string) {
  const match = text.match(/(?:\+?260|0)\d{9}/);
  return match ? normalisePhone(match[0]) : null;
}

function phoneForAvatar(avatar: Element) {
  const container = avatar.closest(".leadListItem") || avatar.closest(".clientIdentity") || avatar.closest(".conversationHeader");
  return container ? phoneFromText(container.textContent || "") : null;
}

function showToast(message: string, tone: "ok" | "error" = "ok") {
  let toast = document.querySelector<HTMLElement>(".clientProfilePhotoToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "clientProfilePhotoToast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.classList.add("show");
  window.setTimeout(() => toast?.classList.remove("show"), 2600);
}

function paintPhotos(photos: PhotoIndex) {
  document.querySelectorAll<HTMLElement>(".clientAvatar").forEach((avatar) => {
    const phone = phoneForAvatar(avatar);
    const entry = phone ? photos[phone] : undefined;
    let image = avatar.querySelector<HTMLImageElement>("img[data-client-profile-photo]");
    if (!entry) {
      image?.remove();
      avatar.classList.remove("hasClientPhoto");
      return;
    }
    if (!image) {
      image = document.createElement("img");
      image.dataset.clientProfilePhoto = "true";
      image.alt = "";
      avatar.prepend(image);
    }
    if (image.getAttribute("src") !== entry.url) image.src = entry.url;
    avatar.classList.add("hasClientPhoto");
  });

  const activeAvatar = document.querySelector<HTMLElement>(".conversationHeader .clientAvatar.large");
  if (activeAvatar) {
    activeAvatar.tabIndex = 0;
    activeAvatar.setAttribute("role", "button");
    activeAvatar.setAttribute("aria-label", "Change client profile photo");
    activeAvatar.title = "Change client profile photo";
  }
}

async function cropPhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Please choose an image smaller than 12 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to read this image."));
      image.src = objectUrl;
    });
    const size = 320;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");
    const scale = Math.max(size / source.naturalWidth, size / source.naturalHeight);
    const width = source.naturalWidth * scale;
    const height = source.naturalHeight * scale;
    context.drawImage(source, (size - width) / 2, (size - height) / 2, width, height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ClientProfilePhotoEnhancer() {
  useEffect(() => {
    let photos: PhotoIndex = {};
    let selectedPhone: string | null = null;
    let disposed = false;
    let frame = 0;
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/jpeg,image/png,image/webp";
    picker.className = "clientProfilePhotoInput";
    document.body.appendChild(picker);

    const repaint = () => {
      if (!disposed) paintPhotos(photos);
    };

    const load = async () => {
      try {
        const response = await fetch("/api/admin/client-profile-photos", { cache: "no-store" });
        const data = await response.json() as { photos?: PhotoIndex };
        if (response.ok && data.photos && !disposed) {
          photos = data.photos;
          repaint();
        }
      } catch {
        // Initials remain available when photo metadata is temporarily unavailable.
      }
    };

    const openPicker = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      const avatar = target.closest<HTMLElement>(".conversationHeader .clientAvatar.large");
      if (!avatar) return false;
      const phone = phoneForAvatar(avatar);
      if (!phone) return false;
      selectedPhone = phone;
      picker.value = "";
      picker.click();
      return true;
    };

    const onClick = (event: MouseEvent) => {
      if (openPicker(event.target)) event.preventDefault();
    };

    const onKey = (event: KeyboardEvent) => {
      if ((event.key === "Enter" || event.key === " ") && openPicker(event.target)) event.preventDefault();
    };

    const onFile = async () => {
      const file = picker.files?.[0];
      if (!file || !selectedPhone) return;
      const phone = selectedPhone;
      try {
        showToast("Preparing profile photo…");
        const imageDataUrl = await cropPhoto(file);
        const response = await fetch("/api/admin/client-profile-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, imageDataUrl })
        });
        const data = await response.json() as { error?: string; photo?: PhotoEntry };
        if (!response.ok || !data.photo) throw new Error(data.error || "Unable to save the profile photo.");
        photos = { ...photos, [phone]: data.photo };
        repaint();
        showToast("Profile photo updated");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to save the profile photo.", "error");
      }
    };

    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        repaint();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    picker.addEventListener("change", onFile);
    void load();
    repaint();

    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      picker.removeEventListener("change", onFile);
      picker.remove();
    };
  }, []);

  return null;
}
