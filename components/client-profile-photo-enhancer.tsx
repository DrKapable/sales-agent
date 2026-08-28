// @ts-nocheck
"use client";

import { useEffect } from "react";

function normalisePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("0") && digits.length === 10 ? `260${digits.slice(1)}` : digits;
}

function phoneFromText(text) {
  const match = String(text || "").match(/(?:\+?260|0)\d{9}/);
  return match ? normalisePhone(match[0]) : null;
}

function phoneForAvatar(avatar) {
  const container = avatar.closest(".leadListItem") || avatar.closest(".clientIdentity") || avatar.closest(".conversationHeader");
  return container ? phoneFromText(container.textContent) : null;
}

function paintPhotos(photos) {
  document.querySelectorAll(".clientAvatar").forEach((avatar) => {
    const phone = phoneForAvatar(avatar);
    const photo = phone ? photos[phone] : null;
    let image = avatar.querySelector("img[data-client-profile-photo]");
    if (!photo) {
      if (image) image.remove();
      avatar.classList.remove("hasClientPhoto");
      return;
    }
    if (!image) {
      image = document.createElement("img");
      image.dataset.clientProfilePhoto = "true";
      image.alt = "";
      avatar.prepend(image);
    }
    if (image.src !== photo) image.src = photo;
    avatar.classList.add("hasClientPhoto");
  });

  const activeAvatar = document.querySelector(".conversationHeader .clientAvatar.large");
  if (activeAvatar) {
    activeAvatar.tabIndex = 0;
    activeAvatar.setAttribute("role", "button");
    activeAvatar.setAttribute("aria-label", "Upload or replace client profile photo");
    activeAvatar.title = "Tap to add or change client photo";
  }
}

async function cropPhoto(file) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Please choose an image smaller than 12 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const source = await new Promise((resolve, reject) => {
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
    return canvas.toDataURL("image/jpeg", 0.76);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ClientProfilePhotoEnhancer() {
  useEffect(() => {
    let photos = {};
    let selectedPhone = null;
    let disposed = false;
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
        const data = await response.json();
        if (response.ok && data.photos && !disposed) {
          photos = data.photos;
          repaint();
        }
      } catch {}
    };

    const choosePhoto = (event) => {
      const element = event.target instanceof Element ? event.target : null;
      const avatar = element ? element.closest(".conversationHeader .clientAvatar.large") : null;
      if (!avatar) return false;
      const phone = phoneForAvatar(avatar);
      if (!phone) return false;
      selectedPhone = phone;
      picker.value = "";
      picker.click();
      return true;
    };

    const onClick = (event) => {
      if (choosePhoto(event)) event.preventDefault();
    };

    const onKey = (event) => {
      if ((event.key === "Enter" || event.key === " ") && choosePhoto(event)) event.preventDefault();
    };

    const onFile = async () => {
      const file = picker.files && picker.files[0];
      if (!file || !selectedPhone) return;
      try {
        const imageDataUrl = await cropPhoto(file);
        const response = await fetch("/api/admin/client-profile-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: selectedPhone, imageDataUrl })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to save the profile photo.");
        photos = { ...photos, [selectedPhone]: imageDataUrl };
        repaint();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Unable to save the profile photo.");
      }
    };

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    picker.addEventListener("change", onFile);
    void load();
    repaint();
    const domTimer = window.setInterval(repaint, 1200);
    const dataTimer = window.setInterval(() => void load(), 30000);

    return () => {
      disposed = true;
      window.clearInterval(domTimer);
      window.clearInterval(dataTimer);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      picker.removeEventListener("change", onFile);
      picker.remove();
    };
  }, []);

  return null;
}
