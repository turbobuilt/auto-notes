<script setup lang="ts">
import { checkAndShowHttpError } from '@/lib/checkAndShowHttpError'
import router from '@/router'
import { serverMethods } from '@/serverMethods'
import { setUser } from '@/store'


const d = reactive({
  email: '',
  password: '',
  error: '',
  loading: false
});

async function register() {
  d.loading = true
  d.error = ''
  let result = await serverMethods.user.createAccount({
    email: d.email,
    password: d.password
  })
  d.loading = false;
  console.log("result is", result)
  if (await checkAndShowHttpError(result))
    return;
  setUser(result.data.user, result.data.authToken, result.data.expires);
  router.push('/app/');
}
</script>
<template>
  <div class="register-page">
    <div class="register-container">
      <!-- Left Side - Marketing Content -->
      <div class="register-content">
        <h1>Join the Revolution in Therapy Documentation</h1>
        <p class="tagline">Thousands of therapists have already reclaimed their evenings and weekends.</p>
        
        <div class="benefit-list">
          <div class="benefit-item">
            <div class="benefit-icon">⏱️</div>
            <div class="benefit-text">
              <h3>Save 6+ Hours Weekly</h3>
              <p>Automatic note generation means no more late nights catching up on documentation.</p>
            </div>
          </div>
          
          <div class="benefit-item">
            <div class="benefit-icon">💯</div>
            <div class="benefit-text">
              <h3>98% Accuracy Rate</h3>
              <p>Our AI is trained specifically for therapeutic contexts and clinical language.</p>
            </div>
          </div>
          
          <div class="benefit-item">
            <div class="benefit-icon">🔒</div>
            <div class="benefit-text">
              <h3>HIPAA Compliant Security</h3>
              <p>Enterprise-grade encryption and security protocols protect all patient data.</p>
            </div>
          </div>
        </div>
        
        <div class="testimonial">
          <p>"I was skeptical at first, but AutoNotes has given me back my personal life while improving my documentation quality. Best professional decision I've made in years."</p>
          <div class="testimonial-author">
            <h4>— Dr. Lisa Winters, Psychotherapist</h4>
          </div>
        </div>
      </div>
      
      <!-- Right Side - Registration Form -->
      <div class="register-form-container">
        <div class="register-form">
          <h2>Start Your Free Trial</h2>
          <p class="form-subtitle">No credit card required. 14-day free access to all premium features.</p>
          
          <form @submit.prevent="register">
            <div class="form-group">
              <label for="email">Email Address</label>
              <input 
                type="email" 
                id="email" 
                v-model="d.email" 
                required 
                placeholder="your@email.com"
              />
            </div>
            
            <div class="form-group">
              <label for="password">Password</label>
              <input 
                type="password" 
                id="password" 
                v-model="d.password" 
                required 
                placeholder="Create a secure password"
                minlength="8"
              />
            </div>
            
            <div class="error-message" v-if="d.error">{{ d.error }}</div>
            
            <button 
              type="submit" 
              class="register-button" 
              :disabled="d.loading"
            >
              <span v-if="!d.loading">Create Your Free Account</span>
              <span v-else>Creating Account...</span>
            </button>
          </form>
          
          <p class="login-link">Already have an account? <a href="/app/login">Log in</a></p>
          
          <div class="trust-badges">
            <div class="trust-badge">
              <span class="badge-icon">🔒</span>
              <span class="badge-text">Secure</span>
            </div>
            <div class="trust-badge">
              <span class="badge-icon">✓</span>
              <span class="badge-text">HIPAA Compliant</span>
            </div>
            <div class="trust-badge">
              <span class="badge-icon">⭐</span>
              <span class="badge-text">5-Star Rated</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<style lang="scss">
@import '../../scss/variables.module.scss';

.register-page {
  min-height: 100vh;
  font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
  color: $text-dark;
  line-height: 1.6;
  background: linear-gradient(140deg, $background-light 0%, $background-light-alt 100%);
  padding: $spacing-lg;
  display: flex;
  align-items: center;
  justify-content: center;
  
  .register-container {
    display: flex;
    max-width: 1200px;
    width: 100%;
    background: $white;
    border-radius: $border-radius-lg;
    overflow: hidden;
    box-shadow: $shadow-lg;
    
    @media (max-width: $breakpoint-lg) {
      flex-direction: column-reverse;
      max-width: 600px;
    }
  }
  
  .register-content {
    flex: 1;
    padding: $spacing-xl;
    background: linear-gradient(140deg, #f8faff 0%, #f0f4ff 100%);
    
    h1 {
      font-size: clamp(1.75rem, 3vw, 2.5rem);
      font-weight: 800;
      background: $primary-gradient;
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      margin-bottom: $spacing-md;
    }
    
    .tagline {
      font-size: 1.1rem;
      color: $text-muted;
      margin-bottom: $spacing-lg;
    }
    
    .benefit-list {
      margin: $spacing-lg 0;
    }
    
    .benefit-item {
      display: flex;
      margin-bottom: $spacing-md;
      
      .benefit-icon {
        font-size: 1.5rem;
        margin-right: $spacing-sm;
        min-width: 40px;
        height: 40px;
        background: $white;
        border-radius: $border-radius-circle;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: $shadow-sm;
      }
      
      .benefit-text {
        h3 {
          font-size: 1.1rem;
          margin-bottom: 0.25rem;
          font-weight: 600;
        }
        
        p {
          color: $text-muted;
          margin: 0;
          font-size: 0.95rem;
        }
      }
    }
    
    .testimonial {
      margin-top: $spacing-lg;
      padding: $spacing-md;
      background: rgba(255, 255, 255, 0.7);
      border-radius: $border-radius-md;
      position: relative;
      
      &:before {
        content: '"';
        position: absolute;
        top: -15px;
        left: 15px;
        font-size: 3rem;
        color: rgba(76, 94, 207, 0.2);
        font-family: serif;
      }
      
      p {
        font-style: italic;
        color: #444;
        margin-bottom: $spacing-sm;
      }
      
      .testimonial-author {
        text-align: right;
        
        h4 {
          font-weight: 600;
          color: #555;
          font-size: 0.9rem;
        }
      }
    }
  }
  
  .register-form-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: $spacing-xl;
    background: $white;
  }
  
  .register-form {
    width: 100%;
    max-width: 400px;
    
    h2 {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: $spacing-xs;
      text-align: center;
    }
    
    .form-subtitle {
      text-align: center;
      color: $text-muted;
      margin-bottom: $spacing-lg;
    }
    
    .form-group {
      margin-bottom: $spacing-md;
      
      label {
        display: block;
        margin-bottom: $spacing-xs;
        font-weight: 500;
      }
      
      input {
        width: 100%;
        padding: $spacing-sm;
        border: 1px solid #ddd;
        border-radius: $border-radius-md;
        font-size: 1rem;
        transition: border-color 0.2s, box-shadow 0.2s;
        
        &:focus {
          outline: none;
          border-color: $primary;
          box-shadow: 0 0 0 3px rgba(76, 94, 207, 0.15);
        }
      }
    }
    
    .error-message {
      color: #e53935;
      margin-bottom: $spacing-sm;
      font-size: 0.9rem;
    }
    
    .register-button {
      display: block;
      width: 100%;
      background: $primary-gradient;
      color: $white;
      border: none;
      padding: $spacing-sm;
      border-radius: $border-radius-md;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: $shadow-md;
      
      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 15px rgba(76, 94, 207, 0.3);
      }
      
      &:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        transform: none;
      }
    }
    
    .login-link {
      text-align: center;
      margin-top: $spacing-md;
      font-size: 0.9rem;
      
      a {
        color: $primary;
        text-decoration: none;
        font-weight: 500;
        
        &:hover {
          text-decoration: underline;
        }
      }
    }
    
    .trust-badges {
      display: flex;
      justify-content: center;
      gap: $spacing-md;
      margin-top: $spacing-lg;
      
      .trust-badge {
        display: flex;
        flex-direction: column;
        align-items: center;
        font-size: 0.8rem;
        
        .badge-icon {
          font-size: 1.2rem;
          margin-bottom: $spacing-xs;
        }
        
        .badge-text {
          color: $text-muted;
        }
      }
    }
  }
  
  @media (max-width: $breakpoint-lg) {
    .register-content {
      padding: $spacing-lg;
    }
    
    .register-form-container {
      padding: $spacing-lg;
    }
  }
  
  @media (max-width: $breakpoint-md) {
    padding: $spacing-md;
    
    .register-container {
      box-shadow: $shadow-md;
    }
  }
  
  @media (max-width: $breakpoint-sm) {
    padding: $spacing-sm;
    
    .register-content {
      padding: $spacing-md;
    }
    
    .register-form-container {
      padding: $spacing-md;
    }
  }
}
</style>