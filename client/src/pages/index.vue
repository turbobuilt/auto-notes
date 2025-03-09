<script lang="ts" setup>
import WebsiteMenu from '../components/WebsiteMenu.vue';
import WebsiteFooter from '../components/WebsiteFooter.vue';
</script>

<template>
  <div class="index-page">
    <WebsiteMenu />

    <!-- Hero Section -->
    <section class="hero">
      <div class="hero-content">
        <h1>Say Goodbye to Manual Therapy Notes Forever</h1>
        <p class="subtitle">Our AI-powered system records your sessions and transforms conversations into professional clinical notes, saving you hours every week.</p>
        <a href="/app/register" class="cta-button">Start Your Free Trial</a>
      </div>
      <div class="hero-image">
        <img prompt="Therapist relaxing with coffee while AI writes notes, bright modern office setting with laptop showing Auto Notes interface" />
      </div>
    </section>

    <!-- Time Saved Stats -->
    <section class="stats">
      <div class="stat-item">
        <h3>6+ Hours</h3>
        <p>Saved Weekly</p>
      </div>
      <div class="stat-item">
        <h3>98%</h3>        
        <p>Accuracy Rate</p>
      </div>
      <div class="stat-item">
        <h3>1000+</h3>
        <p>Happy Therapists</p>
      </div>
    </section>

    <!-- How It Works -->
    <section id="features" class="features">
      <h2>How AutoNotes Works</h2>
      
      <div class="feature-item">
        <div class="feature-text">
          <h3>1. Record Your Session</h3>
          <p>Simply start a secure recording in our HIPAA-compliant app. Focus entirely on your client without worrying about taking notes.</p>
        </div>
        <div class="feature-image">
          <img src="/home/recording-convo.png" />
        </div>
      </div>
      
      <div class="feature-item reverse">
        <div class="feature-text">
          <h3>2. AI Processes Your Conversation</h3>
          <p>Our advanced AI transcribes and analyzes the conversation, identifying key clinical insights, interventions, and client progress.</p>
        </div>
        <div class="feature-image">
          <img src="/home/digital-audio.png" />
        </div>
      </div>
      
      <div class="feature-item">
        <div class="feature-text">
          <h3>3. Review & Finalize Professional Notes</h3>
          <p>Within minutes, receive perfectly formatted clinical notes ready for your review. Make any adjustments and finalize with one click.</p>
        </div>
        <div class="feature-image">
          <img src="/home/therapist-looking-at-tablet.png" />
        </div>
      </div>

      <div class="cta-center">
        <a href="/app/register" class="cta-button">Transform Your Practice Today</a>
      </div>
    </section>

    <!-- Benefits Section -->
    <section class="benefits">
      <h2>Reclaim Your Time & Joy</h2>
      
      <div class="benefits-grid">
        <div class="benefit-card">
          <div class="icon">📊</div>
          <h3>Eliminate Documentation Burden</h3>
          <p>No more staying late to complete notes. Finish your workday when your sessions end.</p>
        </div>
        
        <div class="benefit-card">
          <div class="icon">🧠</div>
          <h3>Be More Present</h3>
          <p>Focus 100% on your client without dividing attention between listening and note-taking.</p>
        </div>
        
        <div class="benefit-card">
          <div class="icon">💰</div>
          <h3>Increase Revenue</h3>
          <p>See more clients and reduce administrative costs with our efficient system.</p>
        </div>
        
        <div class="benefit-card">
          <div class="icon">🔒</div>
          <h3>HIPAA Compliant</h3>
          <p>Enterprise-grade security ensures all client information remains confidential and protected.</p>
        </div>
      </div>
    </section>

    <!-- Testimonials -->
    <section id="testimonials" class="testimonials">
      <h2>What Therapists Are Saying</h2>
      
      <div class="testimonial-carousel">
        <div class="testimonial-item">
          <p>"AutoNotes has completely transformed my practice. I used to spend 2 hours every evening catching up on notes. Now I leave work on time and feel refreshed the next day."</p>
          <div class="testimonial-author">
            <img src="/home/female-therapist.png" />
            <div>
              <h4>Dr. Sarah Johnson</h4>
              <p>Clinical Psychologist</p>
            </div>
          </div>
        </div>
        
        <div class="testimonial-item">
          <p>"The quality of notes from AutoNotes exceeds what I was able to produce manually. Insurance companies have actually commented on how thorough and professional my documentation has become."</p>
          <div class="testimonial-author">
            <img src="/home/male-therapist.png" />
            <div>
              <h4>Michael Chen, LMFT</h4>
              <p>Family Therapist</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing Teaser -->
    <section class="pricing-teaser">
      <h2>Simple, Transparent Pricing</h2>
      <p>Plans starting at just $49/month with unlimited notes</p>
      <div class="pricing-actions">
        <a href="/pricing" class="secondary-btn">View Pricing</a>
        <a href="/app/register" class="cta-button">Start Free Trial</a>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="final-cta">
      <div class="final-cta-content">
        <h2>Join Thousands of Therapists Who've Reclaimed Their Time</h2>
        <p>No credit card required to start your 14-day free trial</p>
        <a href="/app/register" class="cta-button glow">Get Started Now</a>
      </div>
    </section>

    <WebsiteFooter />
  </div>
</template>

<style lang="scss">
@import '../scss/variables.module.scss';

.index-page {
  font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
  color: $text-dark;
  line-height: 1.6;
  overflow-x: hidden;
  
  // Base styles
  h1, h2, h3, h4 {
    margin: 0;
    line-height: 1.3;
  }
  
  h1 {
    font-size: clamp(2rem, 5vw, 3.5rem);
    font-weight: 800;
    background: $primary-gradient;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    margin-bottom: $spacing-md;
  }
  
  h2 {
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    font-weight: 700;
    margin-bottom: $spacing-md;
    text-align: center;
  }
  
  p {
    margin-top: 0;
  }
  
  section {
    padding: $spacing-xxl $spacing-lg;
    
    @media (max-width: $breakpoint-md) {
      padding: $spacing-xl $spacing-md;
    }
  }
  
  // Hero section
  .hero {
    display: flex;
    align-items: center;
    padding: 6rem $spacing-lg;
    background: linear-gradient(140deg, $background-light 0%, $background-light-alt 100%);
    
    .hero-content {
      flex: 1;
      max-width: 600px;
      
      .subtitle {
        font-size: 1.25rem;
        color: $text-muted;
        margin-bottom: 2.5rem;
      }
    }
    
    .hero-image {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      
      img {
        max-width: 100%;
        border-radius: $border-radius-lg;
        box-shadow: $shadow-lg;
      }
    }
    
    @media (max-width: $breakpoint-lg) {
      flex-direction: column;
      text-align: center;
      
      .hero-content {
        margin-bottom: $spacing-xl;
      }
    }
  }
  
  // CTA Button
  .cta-button {
    display: inline-block;
    background: $primary-gradient;
    color: $white;
    padding: $spacing-sm $spacing-lg;
    border-radius: $border-radius-md;
    font-weight: 600;
    text-decoration: none;
    transition: transform 0.2s, box-shadow 0.2s;
    box-shadow: $shadow-md;
    
    &:hover {
      transform: translateY(-3px);
      box-shadow: 0 12px 20px rgba(76, 94, 207, 0.4);
    }
    
    &.glow {
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0% {
        box-shadow: 0 0 0 0 rgba(76, 94, 207, 0.7);
      }
      70% {
        box-shadow: 0 0 0 15px rgba(76, 94, 207, 0);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(76, 94, 207, 0);
      }
    }
  }
  
  // Stats section
  .stats {
    display: flex;
    justify-content: space-around;
    padding: $spacing-xl;
    background: $white;
    box-shadow: 0 -10px 20px rgba(0, 0, 0, 0.03), 0 10px 20px rgba(0, 0, 0, 0.03);
    margin: 0 auto;
    max-width: 1000px;
    border-radius: $border-radius-lg;
    transform: translateY(-50px);
    
    .stat-item {
      text-align: center;
      
      h3 {
        font-size: 2.5rem;
        font-weight: 800;
        margin: 0;
        background: $primary-gradient;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      
      p {
        font-size: 1.1rem;
        margin: 0.5rem 0 0 0;
        color: $text-muted;
      }
    }
    
    @media (max-width: $breakpoint-md) {
      flex-direction: column;
      gap: $spacing-lg;
      transform: translateY(-30px);
    }
  }
  
  // Features section
  .features {
    background: $white;
    padding-top: $spacing-xl;
    
    .feature-item {
      display: flex;
      align-items: center;
      margin: $spacing-xxl 0;
      gap: $spacing-xl;
      
      &.reverse {
        flex-direction: row-reverse;
      }
      
      .feature-text {
        flex: 1;
        
        h3 {
          font-size: 1.75rem;
          margin-bottom: $spacing-sm;
          background: $primary-gradient;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        
        p {
          font-size: 1.1rem;
          color: $text-muted;
        }
      }
      
      .feature-image {
        flex: 1;
        
        img {
          width: 100%;
          border-radius: $border-radius-lg;
          box-shadow: $shadow-lg;
        }
      }
      
      @media (max-width: $breakpoint-lg) {
        flex-direction: column !important;
        text-align: center;
      }
    }
    
    .cta-center {
      text-align: center;
      margin: $spacing-xl 0 $spacing-lg;
    }
  }
  
  // Benefits section
  .benefits {
    background: linear-gradient(140deg, $background-light-alt 0%, #f5f0ff 100%);
    
    .benefits-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: $spacing-lg;
      max-width: $breakpoint-xl;
      margin: 0 auto;
    }
    
    .benefit-card {
      background: $white;
      padding: $spacing-lg;
      border-radius: $border-radius-lg;
      box-shadow: $shadow-card;
      transition: transform 0.3s, box-shadow 0.3s;
      
      &:hover {
        transform: translateY(-5px);
        box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
      }
      
      .icon {
        font-size: 2rem;
        margin-bottom: $spacing-sm;
      }
      
      h3 {
        margin-bottom: $spacing-sm;
      }
      
      p {
        color: $text-muted;
      }
    }
  }
  
  // Testimonials
  .testimonials {
    background: $white;
    
    .testimonial-carousel {
      display: flex;
      gap: $spacing-lg;
      max-width: $breakpoint-xl;
      margin: 0 auto;
      overflow-x: auto;
      padding: $spacing-sm 0;
      scrollbar-width: none;
      
      &::-webkit-scrollbar {
        display: none;
      }
    }
    
    .testimonial-item {
      flex: 1 0 calc(50% - 2rem);
      min-width: 300px;
      background: #f8faff;
      padding: $spacing-lg;
      border-radius: $border-radius-lg;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.05);
      
      > p {
        font-style: italic;
        margin-bottom: $spacing-md;
        color: #444;
        font-size: 1.1rem;
      }
      
      .testimonial-author {
        display: flex;
        align-items: center;
        
        img {
          width: 60px;
          height: 60px;
          border-radius: $border-radius-circle;
          object-fit: cover;
          margin-right: $spacing-sm;
        }
        
        h4 {
          margin: 0;
          font-weight: 600;
        }
        
        p {
          margin: 0.25rem 0 0 0;
          color: #666;
        }
      }
    }
  }
  
  // Pricing teaser
  .pricing-teaser {
    background: $primary-gradient;
    color: $white;
    text-align: center;
    
    h2, p {
      color: $white;
    }
    
    p {
      font-size: 1.2rem;
      margin-bottom: $spacing-lg;
    }
    
    .pricing-actions {
      display: flex;
      gap: $spacing-sm;
      justify-content: center;
      
      @media (max-width: $breakpoint-sm) {
        flex-direction: column;
        align-items: center;
      }
    }
    
    .secondary-btn {
      display: inline-block;
      background: rgba(255, 255, 255, 0.2);
      color: $white;
      padding: $spacing-sm $spacing-lg;
      border-radius: $border-radius-md;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
      
      &:hover {
        background: rgba(255, 255, 255, 0.3);
      }
    }
    
    .cta-button {
      background: $white;
      color: $primary;
      box-shadow: 0 8px 15px rgba(0, 0, 0, 0.1);
    }
  }
  
  // Final CTA
  .final-cta {
    text-align: center;
    background: url('https://source.unsplash.com/random/1920x1080/?gradient') center/cover;
    position: relative;
    
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.9);
      z-index: 1;
    }
    
    .final-cta-content {
      position: relative;
      z-index: 2;
      
      p {
        font-size: 1.2rem;
        margin-bottom: $spacing-lg;
      }
    }
  }
}
</style>
