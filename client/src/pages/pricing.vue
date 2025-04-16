<script lang="ts" setup>
import WebsiteMenu from '../components/WebsiteMenu.vue';
import WebsiteFooter from '../components/WebsiteFooter.vue';
</script>

<template>
  <div class="pricing-page">
    <WebsiteMenu />

    <!-- Hero Section -->
    <section class="hero">
      <div class="hero-content">
        <h1>Simple, Transparent Pricing</h1>
        <p class="subtitle">Choose the plan that fits your practice needs with no hidden fees</p>
      </div>
    </section>

    <!-- Pricing Cards -->
    <section class="pricing-cards">
      <div class="pricing-card">
        <div class="card-header">
          <h3>Free</h3>
          <div class="price">$0</div>
          <p>Perfect for getting started</p>
        </div>
        <div class="card-body">
          <ul class="features-list">
            <li>
              <span class="feature-name">Per session cost</span>
              <span class="feature-value">$0</span>
            </li>
            <li>
              <span class="feature-name">Sessions per month</span>
              <span class="feature-value">5</span>
            </li>
            <li>
              <span class="feature-name">Notes emailed to you</span>
              <span class="feature-value no">✖</span>
            </li>
            <li>
              <span class="feature-name">Storage duration</span>
              <span class="feature-value">30 days</span>
            </li>
            <li>
              <span class="feature-name">AI-powered transcription</span>
              <span class="feature-value yes">✓</span>
            </li>
            <li>
              <span class="feature-name">Automated note generation</span>
              <span class="feature-value yes">✓</span>
            </li>
            <li>
              <span class="feature-name">Video conferencing</span>
              <span class="feature-value no">✖</span>
            </li>
          </ul>
        </div>
        <div class="card-footer">
          <a href="/app/register" class="cta-button">Start Now</a>
        </div>
      </div>

      <div class="pricing-card popular">
        <div class="popular-badge">Most Popular</div>
        <div class="card-header">
          <h3>Standard</h3>
          <div class="price">15¢<span>/session</span></div>
          <p>For growing practices</p>
        </div>
        <div class="card-body">
          <ul class="features-list">
            <li>
              <span class="feature-name">Per session cost</span>
              <span class="feature-value">15¢</span>
            </li>
            <li>
              <span class="feature-name">Sessions per month</span>
              <span class="feature-value">Unlimited</span>
            </li>
            <li>
              <span class="feature-name">Notes emailed to you</span>
              <span class="feature-value yes">✓</span>
            </li>
            <li>
              <span class="feature-name">Storage duration</span>
              <span class="feature-value">30 days</span>
            </li>
            <li>
              <span class="feature-name">AI-powered transcription</span>
              <span class="feature-value yes">✓</span>
            </li>
            <li>
              <span class="feature-name">Automated note generation</span>
              <span class="feature-value yes">✓</span>
            </li>
            <li>
              <span class="feature-name">Video conferencing</span>
              <span class="feature-value yes">✓</span>
            </li>
          </ul>
        </div>
        <div class="card-footer">
          <a href="/app/register" class="cta-button">Start Now</a>
        </div>
      </div>

      <div class="pricing-card">
        <div class="card-header">
          <h3>Storage</h3>
          <div class="price">25¢<span>/session</span></div>
          <p>For established practices</p>
        </div>
        <div class="card-body">
          <ul class="features-list">
            <li>
              <span class="feature-name">Per session cost</span>
              <span class="feature-value">25¢</span>
            </li>
            <li>
              <span class="feature-name">Sessions per month</span>
              <span class="feature-value">Unlimited</span>
            </li>
            <li>
              <span class="feature-name">Notes emailed to you</span>
              <span class="feature-value yes">✓</span>
            </li>
            <li>
              <span class="feature-name">Storage duration</span>
              <span class="feature-value">5 years</span>
            </li>
            <li>
              <span class="feature-name">AI-powered transcription</span>
              <span class="feature-value yes">✓</span>
            </li>
            <li>
              <span class="feature-name">Automated note generation</span>
              <span class="feature-value yes">✓</span>
            </li>
            <li>
              <span class="feature-name">Video conferencing</span>
              <span class="feature-value yes">✓</span>
            </li>
          </ul>
        </div>
        <div class="card-footer">
          <a href="/app/register" class="cta-button">Start Now</a>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section class="all-plans-features">
      <h2>All Plans Include</h2>
      
      <div class="features-grid">
        <div class="feature-item">
          <div class="icon">🔒</div>
          <h3>HIPAA Compliant</h3>
          <p>Enterprise-grade security to ensure all client information remains protected</p>
        </div>
        
        <div class="feature-item">
          <div class="icon">🎓</div>
          <h3>Clinical Terminology</h3>
          <p>AI trained on professional therapeutic language for accurate clinical documentation</p>
        </div>
        
        <div class="feature-item">
          <div class="icon">⚡</div>
          <h3>Fast Processing</h3>
          <p>Get your session notes ready in minutes, not hours</p>
        </div>
        
        <div class="feature-item">
          <div class="icon">📱</div>
          <h3>Mobile Friendly</h3>
          <p>Access and review notes from any device, anywhere</p>
        </div>
        
        <div class="feature-item">
          <div class="icon">🔄</div>
          <h3>Unlimited Edits</h3>
          <p>Edit and customize your AI-generated notes as needed</p>
        </div>
        
        <div class="feature-item">
          <div class="icon">💬</div>
          <h3>Support</h3>
          <p>Access to our customer support team for assistance when you need it</p>
        </div>
      </div>
    </section>

    <!-- FAQ Section -->
    <section class="faq">
      <h2>Frequently Asked Questions</h2>
      
      <div class="faq-item">
        <h3>How does billing work?</h3>
        <p>You'll only be charged for the sessions you process. For Standard and Storage plans, billing occurs at the end of each month based on your usage.</p>
      </div>
      
      <div class="faq-item">
        <h3>Can I change plans anytime?</h3>
        <p>Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle.</p>
      </div>
      
      <div class="faq-item">
        <h3>Is there a contract or commitment?</h3>
        <p>No, all plans are month-to-month with no long-term commitment required.</p>
      </div>
      
      <div class="faq-item">
        <h3>How accurate are the generated notes?</h3>
        <p>Our AI maintains a 98% accuracy rate, but you always have the opportunity to review and edit before finalizing.</p>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="final-cta">
      <div class="final-cta-content">
        <h2>Ready to Transform Your Practice?</h2>
        <p>Start with a 14-day free trial, no credit card required</p>
        <a href="/app/register" class="cta-button glow">Get Started Now</a>
      </div>
    </section>

    <WebsiteFooter />
  </div>
</template>

<style lang="scss">
@import '../scss/variables.module.scss';

.pricing-page {
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
    text-align: center;
    padding: 5rem $spacing-lg 3rem;
    background: linear-gradient(140deg, $background-light 0%, $background-light-alt 100%);
    
    .subtitle {
      font-size: 1.25rem;
      color: $text-muted;
      max-width: 700px;
      margin: 0 auto;
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
  
  // Pricing Cards
  .pricing-cards {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: $spacing-lg;
    margin-top: -2rem;
    
    .pricing-card {
      background: $white;
      border-radius: $border-radius-lg;
      box-shadow: $shadow-card;
      overflow: hidden;
      flex: 1;
      min-width: 300px;
      max-width: 380px;
      position: relative;
      transition: transform 0.3s, box-shadow 0.3s;
      
      &:hover {
        transform: translateY(-5px);
        box-shadow: $shadow-lg;
      }
      
      &.popular {
        border: 2px solid $primary;
        transform: translateY(-10px) scale(1.03);
        z-index: 2;
        
        &:hover {
          transform: translateY(-15px) scale(1.03);
        }
        
        .card-header {
          background: linear-gradient(140deg, $primary 0%, #6e7ff3 100%);
          color: $white;
          
          p {
            color: rgba(255,255,255,0.9);
          }
        }
        
        .popular-badge {
          position: absolute;
          top: 12px;
          right: 0;
          background: $secondary; // Changed from $accent to $secondary
          color: $white;
          padding: 0.25rem 1rem;
          font-size: 0.85rem;
          border-top-left-radius: 20px;
          border-bottom-left-radius: 20px;
          font-weight: 600;
          box-shadow: $shadow-sm;
        }
      }
      
      .card-header {
        padding: $spacing-lg;
        text-align: center;
        border-bottom: 1px solid $border-light;
        
        h3 {
          font-size: 1.75rem;
          margin-bottom: $spacing-xs;
        }
        
        .price {
          font-size: 3rem;
          font-weight: 800;
          margin: $spacing-sm 0;
          
          span {
            font-size: 1rem;
            font-weight: normal;
            opacity: 0.8;
          }
        }
        
        p {
          font-size: 1rem;
          color: $text-muted;
          margin: 0;
        }
      }
      
      .card-body {
        padding: $spacing-md;
        
        .features-list {
          list-style: none;
          padding: 0;
          margin: 0;
          
          li {
            display: flex;
            justify-content: space-between;
            padding: $spacing-sm 0;
            border-bottom: 1px solid $border-light;
            
            &:last-child {
              border-bottom: none;
            }
            
            .feature-name {
              font-weight: 500;
            }
            
            .feature-value {
              &.yes {
                color: $success;
                font-weight: bold;
              }
              
              &.no {
                color: $text-muted;
              }
            }
          }
        }
      }
      
      .card-footer {
        padding: $spacing-md $spacing-lg $spacing-xl;
        text-align: center;
      }
    }
    
    @media (max-width: $breakpoint-lg) {
      .pricing-card.popular {
        transform: translateY(0) scale(1);
        
        &:hover {
          transform: translateY(-5px) scale(1);
        }
      }
    }
  }
  
  // Features Section
  .all-plans-features {
    background: linear-gradient(140deg, $background-light-alt 0%, #f5f0ff 100%);
    margin-top: $spacing-xl;
    
    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: $spacing-lg;
      max-width: $breakpoint-xl;
      margin: 0 auto;
    }
    
    .feature-item {
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
        margin: 0;
      }
    }
  }
  
  // FAQ Section
  .faq {
    background: $white;
    
    .faq-item {
      max-width: 800px;
      margin: 0 auto $spacing-md;
      padding: $spacing-md $spacing-lg;
      background: #f8faff;
      border-radius: $border-radius-lg;
      box-shadow: $shadow-sm;
      
      h3 {
        color: $primary;
        margin-bottom: $spacing-xs;
        font-size: 1.2rem;
      }
      
      p {
        margin: 0;
        color: $text-muted;
      }
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
