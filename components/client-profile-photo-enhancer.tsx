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
  document.querySelectorAll<HTMLElement>(".clientAvatar").forEach((avatar) => {
    const phone = phoneForAvatar(avatar);
    const photo = phone ? photos[phone] : null;
    const existing = avatar.querySelector<HTMLImageElement>("img[data-client-profile-photo]");
    if (!photo) {
      existing?.remove();
      avatar.classList.remove("hasClientPhoto");
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

  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to read this image."));
    image.src = URL.createObjectURL(file);
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
  URL.revokeObjectURL(source.src);
  return canvas.toDataURL("image/jpeg", 0.78);
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

    async function loadPhotos() {
      try {
        const response = await fetch("/api/admin/client-profile-photos", { cache: "no-store" });
        const data = await response.json();
        if (response.ok && data?.photos && !stopped) {
          photos = data.photos as PhotoMap;
          applyPhotos(photos);
        }
      } catch {
        // Keep initials visible when profile-photo loading is temporarily unavailable.
      }
    }

    async function savePhoto(phone: string, file: File) {
      const imageDataUrl = await compressProfilePhoto(file);
      const response = await fetch("/api/admin/client-profile-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, imageDataUrl })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save the profile photo.");
      photos = { ...photos, [phone]: imageDataUrl };
      applyPhotos(photos);
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const avatar = target?.closest<HTMLElement>(".conversationHeader .clientAvatar.large");
      if (!avatar) return;
      const phone = phoneForAvatar(avatar);
      if (!phone) return;
      event.preventDefault();
      currentPhone = phone;
      input.value = "";
      input.click();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target as HTMLElement | null;
      const avatar = target?.closest<HTMLElement>(".conversationHeader .clientAvatar.large");
      if (!avatar) return;
      const phone = phoneForAvatar(avatar);
      if (!phone) return;
      event.preventDefault();
      currentPhone = phone;
      input.value = "";
      input.click();
    };

    const onChange = async () => {
      const file = input.files?.[0];
      if (!file || !currentPhone) return;
      try {
        await savePhoto(currentPhone, file);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Unable to save the profile photo.");
      }
    };

    const markEditableAvatar = () => {
      const avatar = document.querySelector<HTMLElement>(".conversationHeader .clientAvatar.large");
      if (!avatar) return;
      avatar.tabIndex = 0;
      avatar.setAttribute("role", "button");
      avatar.setAttribute("aria-label", "Upload or replace client profile photo");
      avatar.title = "Tap to add or change client photo";
    };

    const observer = new MutationObserver(() => {
      applyPhotos(photos);
      markEditableAvatar();
    });
    observer.observe(document.body, { subtree: true, childList: true });
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    input.addEventListener("change", onChange);
    void loadPhotos();
    markEditableAvatar();

    const refresh = window.setInterval(() => void loadPhotos(), 30000);
    return () => {
      stopped = true;
      window.clearInterval(refresh);
      observer.disconnect();
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
      input.removeEventListener("change", onChange);
      input.remove();
    };
  }, []);

  return null;
}
