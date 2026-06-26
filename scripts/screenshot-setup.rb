# frozen_string_literal: true

# Dev-only helper for screenshot capture.
# Usage: DISABLE_SPRING=1 bundle exec rails runner scripts/screenshot-setup.rb [status|modern|classic]

mode = ARGV[0] || 'status'
client_code = ENV.fetch('SCREENSHOT_CLIENT', 'ZTESTATHENA')

client = Client.find_by(code: client_code)
abort("Client not found: #{client_code}") unless client

modern_enabled = client.settings['modern_ui_ux_enabled'] == true ||
                 client.settings['modernUiUxEnabled'] == true

case mode
when 'status'
  puts "client=#{client.code} (#{client.id}) uid=#{client.uid}"
  puts "modern_ui_ux_enabled=#{modern_enabled}"
  puts "analytics_dashboard_enabled=#{client.settings['analytics_dashboard_enabled']}"
when 'modern'
  client.settings['modern_ui_ux_enabled'] = true
  puts "modern_ui_ux_enabled=true for #{client.code}"
when 'classic'
  client.settings['modern_ui_ux_enabled'] = false
  puts "modern_ui_ux_enabled=false for #{client.code}"
else
  abort "Unknown mode: #{mode}. Use status|modern|classic"
end
