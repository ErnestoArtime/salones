import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  output,
  signal,
} from "@angular/core";

@Component({
  selector: "lv-camera-capture",
  standalone: true,
  template: `
    <section class="camera-capture" aria-label="Cámara del dispositivo">
      <video
        #video
        autoplay
        muted
        playsinline
        aria-label="Vista previa de la cámara"
      ></video>
      <p class="field-help">
        Encuadra a una sola persona, con el cabello y la barba completos y buena
        iluminación.
      </p>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      @if (loading()) {
        <p role="status">Abriendo la cámara…</p>
      }
      <div class="row">
        <button
          type="button"
          class="button primary"
          [disabled]="!ready()"
          (click)="capture()"
        >
          Tomar foto
        </button>
        <button
          type="button"
          class="button"
          [disabled]="loading()"
          (click)="switchCamera()"
        >
          Cambiar cámara
        </button>
        @if (error()) {
          <button type="button" class="text-button" (click)="start()">
            Reintentar cámara
          </button>
        }
        <button type="button" class="text-button" (click)="closed.emit()">
          Cerrar cámara
        </button>
      </div>
    </section>
  `,
})
export class CameraCapture implements AfterViewInit, OnDestroy {
  @ViewChild("video", { static: true }) video!: ElementRef<HTMLVideoElement>;
  captured = output<File>();
  closed = output<void>();
  ready = signal(false);
  loading = signal(false);
  error = signal("");
  private stream?: MediaStream;
  private facing = "user";
  private version = 0;
  private destroyed = false;
  ngAfterViewInit() {
    void this.start();
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.version++;
    this.stop();
  }
  private stop() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    if (this.video?.nativeElement) this.video.nativeElement.srcObject = null;
    this.ready.set(false);
  }
  async start() {
    const version = ++this.version;
    this.stop();
    this.error.set("");
    this.loading.set(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: this.facing },
          width: { ideal: 1400 },
          height: { ideal: 1800 },
        },
      });
      if (this.destroyed || version !== this.version) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.video.nativeElement.srcObject = stream;
      await this.video.nativeElement.play();
      if (!this.destroyed && version === this.version) this.ready.set(true);
    } catch (error) {
      if (this.destroyed || version !== this.version) return;
      this.stop();
      this.error.set(
        (error as Error).name === "NotAllowedError"
          ? "Permite el acceso a la cámara en el navegador o selecciona una foto del dispositivo."
          : "No se pudo abrir la cámara. Comprueba que esté disponible o selecciona una foto del dispositivo.",
      );
    } finally {
      if (!this.destroyed && version === this.version) this.loading.set(false);
    }
  }
  switchCamera() {
    this.facing = this.facing === "user" ? "environment" : "user";
    void this.start();
  }
  capture() {
    const video = this.video.nativeElement;
    if (!this.ready() || !video.videoWidth || !video.videoHeight) return;
    const scale = Math.min(
      1,
      1400 / video.videoWidth,
      1800 / video.videoHeight,
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas
      .getContext("2d")!
      .drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob || this.destroyed) return;
        this.stop();
        this.captured.emit(
          new File([blob], "foto-camara.jpg", { type: "image/jpeg" }),
        );
      },
      "image/jpeg",
      0.9,
    );
  }
}
