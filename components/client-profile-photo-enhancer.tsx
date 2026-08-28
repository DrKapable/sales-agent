"use client";

import { useEffect } from "react";

type PhotoMap = Record<string, string>;

function normalisePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) return `260${digits.slice(1)}`;
  return digits;
}

function phoneFromText(text: string) {
  const matches = text.match(/(?:\+?260|0)\d{9}/g) || [];
  return matches.length ? normalisePhone(matches[0]) : null;
}

function phoneForAvatar(avatar: HTMLElement) {
  const listItem = avatar.closest(".leadListItem");
  if (listItem) return phoneFromText(listItem.textContent || "");
  const identity = avatar.closest(".clientIdentity");
  if (identity) return phoneFromText(identity.textContent || "");
  const header = avatar.closest(".conversationHeader");
  return header ? phoneFromText(header.textContent || "") : null;
}

function applyPhotos(photos: PhotoMap) {
  document.querySelectorAll(".clientAvatar").forEach((node) => {
    const avatar = node as HTMLElement;
    const phone = phoneForAvatar(avatar);
    const photo = phone ? photos[phone] : undefined;
    const existing = avatar.querySelector("img[data-client-profile-photo]") as HTMLImageElement | null;
    if (!photo) {
      if (existing) existing.remove();
      avatar.classList.remove("hasClientPhoto");
      return;
    }
    if (existing && existing.src === photo) {
      avatar.classList.add("hasClientPhoto");
      return;
    }
    const image = existing || document.createElement("img");
    image.dataset.clientProfilePhoto = "true";
    image.alt = "";
    image.src = photo;
    if (!existing) avatar.prepend(image);
    avatar.classList.add("hasClientPhoto");
  });
}

async function compressProfilePhoto(file: File) {
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
    let photos: PhotoMap = {};
    let currentPhone: string | null = null;
    let stopped = false;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.className = "clientProfilePhotoInput";
    input.setAttribute("aria-hidden", "true");
    document.body.appendChild(input);

    const refreshDom = () => {
      if (stopped) return;
      applyPhotos(photos);
      const avatar = document.querySelector(".conversationHeader .clientAvatar.large") as HTMLElement | null;
      if (avatar) {
        avatar.tabIndex = 0;
        avatar.setAttribute("role", "button");
        avatar.setAttribute("aria-label", "Upload or replace client profile photo");
        avatar.title = "Tap to add or change client photo";
      }
    };

    async function loadPhotos() {
      try {
        const response = await fetch("/api/admin/client-profile-photos", { cache: "no-store" });
        const data = await response.json() as { photos?: PhotoMap };
        if (response.ok && data.photos && !stopped) {
          photos = data.photos;
          refreshDom();
        }
      } catch {
        // Initials remain visible if photo loading temporarily fails.
      }
    }

    async function savePhoto(phone: string, file: File) {
      const imageDataUrl = await compressProfilePhoto(file);
      const response = await fetch("/api/admin/client-profile-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, imageDataUrl })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to save the profile photo.");
      photos = { ...photos, [phone]: imageDataUrl };
      refreshDom();
    }

    const openPicker = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      const avatar = target.closest(".conversationHeader .clientAvatar.large") as HTMLElement | null;
      if (!avatar) return false;
      const phone = phoneForAvatar(avatar);
      if (!phone) return false;
      currentPhone = phone;
      input.value = "";
      input.click();
      return true;
    };

    const onClick = (event: MouseEvent) => {
      if (openPicker(event.target)) event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (openPicker(event.target)) event.preventDefault();
    };

    const onChange = async () => {
      const file = input.files && input.files[0];
      if (!file || !currentPhone) return;
      try {
        await savePhoto(currentPhone, file);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Unable to save the profile photo.");
      }
    };

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    input.addEventListener("change", onChange);
    void loadPhotos();
    refreshDom();

    const domRefresh = window.setInterval(refreshDom, 1200);
    const dataRefresh = window.setInterval(() => void loadPhotos(), 30000);
    return () => {
      stopped = true;
      window.clearInterval(domRefresh);
      window.clearInterval(dataRefresh);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
      input.removeEventListener("change", onChange);
      input.remove();
    };
  }, []);

  return null;
}
