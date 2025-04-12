import { Component, OnInit, OnDestroy, HostListener, ElementRef, ViewChildren, QueryList, ChangeDetectorRef, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription, interval, timer } from 'rxjs';
import { catchError, switchMap, filter, take } from 'rxjs/operators';
import { gsap } from 'gsap';
import confetti from 'canvas-confetti';

// --- UPDATED Interface ---
interface ImageElementData {
  id: number; // Unique ID for tracking
  file: string; // Changed from currentFile for clarity with JSON
  name: string;
  quote: string;
  skills: string[]; // Array of skills
  alt: string;
  error: boolean;
  element?: ElementRef; // Optional reference to the DOM element
}

@Component({
  selector: 'app-photo-wall',
  templateUrl: './photo-wall.component.html',
  styleUrls: ['./photo-wall.component.css'],
  standalone: false
})
export class PhotoWallComponent implements OnInit, OnDestroy {
  @ViewChildren('imgElement') imgElementRefs!: QueryList<ElementRef<HTMLImageElement>>;

  // --- State Variables ---
  // Use the updated interface type here
  imageElements: ImageElementData[] = [];
  isLoading = true;
  loadError: string | null = null;

  // --- Lightbox State ---
  isLightboxVisible = false;
  lightboxImageUrl: string | null = null;
  lightboxSelectedName: string | null = null; // <-- New state for name
  lightboxSelectedQuote: string | null = null; // <-- New state for quote
  lightboxSelectedSkills: string[] = [];     // <-- New state for skills

  // --- Configuration ---
  private readonly TRIGGER_INTERVAL = 1500; // ms
  private readonly UPDATE_PROBABILITY = 0.1; // 0-1
  private triggerIntervalSubscription: Subscription | null = null;

  // --- AIML Code Easter Egg State ---
  private readonly targetSequence = ['a', 'i', 'm', 'l'];
  private keySequence: string[] = [];

  private subscriptions = new Subscription();

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.fetchImageData();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.triggerIntervalSubscription) {
      this.triggerIntervalSubscription.unsubscribe();
    }
    if (this.imgElementRefs && this.imgElementRefs.length) {
      gsap.killTweensOf(this.imgElementRefs.map(ref => ref.nativeElement));
    }
  }

  fetchImageData(): void {
    this.isLoading = true;
    this.loadError = null;

    // --- UPDATE: Expect Array of ImageElementData (or a specific type matching JSON) ---
    const fetchSub = this.http.get<Omit<ImageElementData, 'id' | 'alt' | 'error'>[]>('assets/photos/index.json')
      .pipe(
        catchError(error => {
          console.error("Error fetching or parsing image index:", error);
          this.loadError = `Error loading photos: ${error.message || 'Could not fetch index.json'}`;
          this.isLoading = false;
          this.imageElements = [];
          this.cdr.detectChanges();
          throw error;
        })
      )
      .subscribe({
        next: jsonData => {
          // Basic validation - check if it's an array
          if (!Array.isArray(jsonData)) {
             console.error("Invalid format: index.json did not contain an array.", jsonData);
             this.loadError = "Invalid data format received from index.json.";
             this.isLoading = false;
             this.imageElements = [];
             this.cdr.detectChanges();
             return; // Stop processing
          }

          // Filter out any entries that don't have a 'file' property
           const validFilesData = jsonData.filter(item => item && typeof item.file === 'string' && item.file.trim() !== '');

           // Ensure unique filenames (optional, but good practice if source JSON might have duplicates)
           const uniqueFilesMap = new Map<string, Omit<ImageElementData, 'id' | 'alt' | 'error'>>();
           validFilesData.forEach(item => {
               if (!uniqueFilesMap.has(item.file)) {
                   uniqueFilesMap.set(item.file, item);
               }
           });
           const uniqueData = Array.from(uniqueFilesMap.values());


          if (uniqueData.length === 0) {
            console.warn("No valid image entries found in index.json.");
            this.loadError = "No photos available to display.";
            this.imageElements = [];
          } else {
            this.initializePhotoWallData(uniqueData);
            this.subscriptions.add(
              timer(100).subscribe(() => {
                 this.animateInitialLoad();
                 this.startIdleAnimation(); // Start idle anim after load (or after initial anim complete)
                 this.startUpdateTrigger();
              })
            );
          }
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
    this.subscriptions.add(fetchSub);
  }

  // --- UPDATE: Initialize with full data ---
  initializePhotoWallData(data: Omit<ImageElementData, 'id' | 'alt' | 'error'>[]): void {
    this.imageElements = data.map((item, index) => ({
      ...item, // Spread the properties from JSON (file, name, quote, skills)
      id: index, // Assign a unique ID
      alt: `Photo of ${item.name || 'AIML 2025 Graduate'}`, // Better alt text
      error: false, // Assume no error initially
      // Ensure skills is always an array, even if missing in JSON
      skills: Array.isArray(item.skills) ? item.skills : []
    }));
    console.log(`Created data for ${this.imageElements.length} unique images.`);
  }

  // --- Get Image Source (Filename is now just 'file') ---
  getImageSrc(filename: string | null): string {
    return filename ? `assets/photos/${filename}` : '';
  }

  onImageError(imageItem: ImageElementData): void {
    console.warn(`Could not load image: assets/photos/${imageItem.file}. Marking as errored.`);
    imageItem.error = true;
    if (this.getValidElements().length < 2 && this.triggerIntervalSubscription) {
      console.log("Stopping update trigger due to insufficient valid images.");
      this.triggerIntervalSubscription.unsubscribe();
      this.triggerIntervalSubscription = null;
    }
  }

  animateInitialLoad(): void {
      const validElements = this.getValidImageElementsForAnimation();
      if (validElements.length === 0) return;

      gsap.fromTo(validElements, {
          opacity: 0,
          scale: 0.8
      }, {
          opacity: 1,
          scale: 1,
          duration: 0.6,
          stagger: 0.03,
          ease: "power2.out",
          delay: 0.2
          // onComplete: () => this.startIdleAnimation() // Start idle after initial anim (or start earlier in fetchImageData)
      });
    }

  startUpdateTrigger(): void {
    if (this.triggerIntervalSubscription) {
      this.triggerIntervalSubscription.unsubscribe();
    }
    if (this.getValidElements().length < 2) {
      console.log("Not starting update trigger: Need at least 2 valid images.");
      return;
    }

    this.triggerIntervalSubscription = interval(this.TRIGGER_INTERVAL)
      .pipe(filter(() => !document.hidden && Math.random() <= this.UPDATE_PROBABILITY))
      .subscribe(() => {
        this.swapTwoRandomImages();
      });
  }

  swapTwoRandomImages(): void {
    const validDataItems = this.getValidElements();
    if (validDataItems.length < 2) return;

    let index1 = Math.floor(Math.random() * validDataItems.length);
    let index2;
    do {
      index2 = Math.floor(Math.random() * validDataItems.length);
    } while (index2 === index1);

    const item1 = validDataItems[index1];
    const item2 = validDataItems[index2];

    const element1 = this.imgElementRefs.find(ref => Number(ref.nativeElement.dataset['id']) === item1.id)?.nativeElement;
    const element2 = this.imgElementRefs.find(ref => Number(ref.nativeElement.dataset['id']) === item2.id)?.nativeElement;

    if (!element1 || !element2) {
      console.log("Swap skipped: Elements not found or animating.");
      console.log("Element1:", element1, "Element2:", element2);
      console.log(!element1, !element2)
      // if(element1) console.log(gsap.isTweening(element1))
      // if(element2) console.log(gsap.isTweening(element2));
      return;
  }

    this.animateSwap(item1, item2, element1, element2);
  }

  animateSwap(item1: ImageElementData, item2: ImageElementData, element1: HTMLImageElement, element2: HTMLImageElement): void {
    const file1 = item1.file; // Use 'file' now
    const file2 = item2.file; // Use 'file' now
    // Keep other data tied to the *item*, swap only the file visually
    const data1Name = item1.name;
    const data1Quote = item1.quote;
    const data1Skills = item1.skills;
    const data1Alt = item1.alt;

    const animPropsOut = { opacity: 0, duration: 0.4, ease: "power1.inOut", overwrite: true };
    const animPropsIn = { opacity: 1, duration: 0.5, ease: "power1.inOut" };

    gsap.to([element1, element2], {
      ...animPropsOut,
      onComplete: () => {
        this.zone.run(() => {
          // --- Perform the data swap ---
          item1.file = file2;
          item1.name = item2.name; // Swap all relevant data
          item1.quote = item2.quote;
          item1.skills = item2.skills;
          item1.alt = item2.alt;

          item2.file = file1;
          item2.name = data1Name;
          item2.quote = data1Quote;
          item2.skills = data1Skills;
          item2.alt = data1Alt;

          this.cdr.detectChanges();
        });

        gsap.delayedCall(0.05, () => {
          gsap.fromTo(element1, { ...animPropsIn, opacity: 0 }, animPropsIn);
          gsap.fromTo(element2, { ...animPropsIn, opacity: 0 }, animPropsIn);
        });
      }
    });
  }


  shuffleImages(): void {
      if (this.isLoading) return; // Prevent shuffle during loading
      // this.isLoading = true; // Optional: Set loading state during shuffle
      console.log("Shuffle clicked!");
      const validDataItems = this.getValidElements();
      if (validDataItems.length < 2) {
          console.log("Not enough valid images to shuffle.");
          return;
      }

      // --- Shuffle the entire data object, not just filenames ---
      const currentData = [...validDataItems]; // Create a copy

      // Fisher-Yates shuffle on the copied data array
      for (let i = currentData.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [currentData[i], currentData[j]] = [currentData[j], currentData[i]];
      }

      const validElements = this.getValidImageElementsForAnimation();
      if (validElements.length === 0) return;

      gsap.to(validElements, {
          opacity: 0,
          scale: 0.95,
          duration: 0.5,
          ease: "power2.in",
          stagger: 0.02,
          overwrite: true,
          onComplete: () => {
              this.zone.run(() => {
                  // --- Reassign properties based on shuffled data array ---
                  validDataItems.forEach((originalItem, index) => {
                      const shuffledItem = currentData[index];
                      originalItem.file = shuffledItem.file;
                      originalItem.name = shuffledItem.name;
                      originalItem.quote = shuffledItem.quote;
                      originalItem.skills = shuffledItem.skills;
                      originalItem.alt = shuffledItem.alt;
                      // Keep originalItem.id and originalItem.error the same
                  });
                  this.cdr.detectChanges();
              });

              gsap.delayedCall(0.05, () => {
                  gsap.to(validElements, {
                      opacity: 1,
                      scale: 1,
                      duration: 0.6,
                      ease: "power2.out",
                      stagger: 0.03
                  });
              });
          }
      });
  }


  startIdleAnimation(): void {
    const validElements = this.getValidImageElementsForAnimation();
    if (validElements.length === 0) return;

    gsap.killTweensOf(validElements, "y,scale");

    gsap.to(validElements, {
      y: "random(-2, 2)",
      scale: "random(1, 1.01)",
      duration: "random(8, 15)",
      ease: "none",
      repeat: -1,
      yoyo: true,
      stagger: { each: 0.05, from: "random" }
    });
  }

  // --- UPDATE: showLightbox now accepts the full data item ---
  showLightbox(item: ImageElementData): void {
    if (!item || item.error || !item.file) return;
    this.lightboxImageUrl = this.getImageSrc(item.file);
    this.lightboxSelectedName = item.name; // Set name
    this.lightboxSelectedQuote = item.quote; // Set quote
    this.lightboxSelectedSkills = item.skills; // Set skills
    this.isLightboxVisible = true;
    // Animation (can remove if handled purely by CSS transition)
    // gsap.fromTo('.modal-overlay', { opacity: 0 }, { opacity: 1, duration: 0.3, display: 'flex' });

    setTimeout(() => {
      const overlay = document.querySelector('.modal-overlay');
      if (overlay) {
        gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.3, display: 'flex' });
      } else {
        console.warn('GSAP target .modal-overlay not found.');
      }
    });
  }

  // --- UPDATE: hideLightbox clears the new state ---
  hideLightbox(): void {
    gsap.to('.modal-overlay', {
      opacity: 0,
      duration: 0.3,
      onComplete: () => {
        this.zone.run(() => {
          this.isLightboxVisible = false;
          this.lightboxImageUrl = null;
          this.lightboxSelectedName = null; // Clear name
          this.lightboxSelectedQuote = null; // Clear quote
          this.lightboxSelectedSkills = [];   // Clear skills
          this.cdr.detectChanges();
        });
      }
    });
  }

  onLightboxOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.hideLightbox();
    }
  }

  @HostListener('document:keyup', ['$event'])
  handleKeyup(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }
    const key = event.key.toLowerCase();
    this.keySequence.push(key);
    this.keySequence = this.keySequence.slice(-this.targetSequence.length);

    if (this.keySequence.join('') === this.targetSequence.join('')) {
      console.log("AIML sequence detected!");
      this.triggerConfetti();
      this.keySequence = [];
    }
  }

  triggerConfetti(): void {
      if (typeof confetti !== 'function') {
          console.warn("Confetti library not loaded.");
          return;
      }
    const count = 200;
    const defaults = { origin: { y: 0.6 } };

    function fire(particleRatio: number, opts: confetti.Options) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
        colors: ['#E50914', '#f5f5f1', '#aaaaaa']
      });
    }

    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.2, { spread: 60 });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    fire(0.1, { spread: 120, startVelocity: 45 });
  }

  private getValidElements(): ImageElementData[] {
    return this.imageElements.filter(item => !item.error && item.file);
  }

   private getValidImageElementsForAnimation(): HTMLImageElement[] {
      const validIds = new Set(this.getValidElements().map(item => item.id));
      // Defensive check: Ensure imgElementRefs is available before mapping
      return this.imgElementRefs ? this.imgElementRefs
          .map(ref => ref.nativeElement)
          .filter(el => el && validIds.has(Number(el.dataset?.['id']))) : []; // Check el exists before accessing dataset
  }

  // --- UPDATE TrackBy ---
  trackById(index: number, item: ImageElementData): number {
    return item.id;
  }
}