Let's be honest: sharing files on the internet can be a real pain. You're either wrestling with email attachment limits, navigating a maze of cloud storage folders, or using some sketchy, ad-filled website. It's 2025. It's ridiculous.
I got tired of it, so I built FlowShare.
Think of it as your own private S.H.I.E.L.D. network, but for your files. It’s the over-engineered solution for your simple sharing problems you never knew you needed. There are no accounts, no logins, and no waiting. Just pure, unadulterated sharing magic.
When you connect, you're not just a "user"—you're an Avenger. The system assigns you a random Marvel codename, and you instantly see every other hero currently online.
Your Superpowers Include:
Multi-File Teleportation: Got a bunch of files? Drag 'em, drop 'em, and yeet the whole bundle (up to 100MB) across the network in a single, glorious upload.
Instant Intel Drops: Sling text notes, code snippets, or that Wi-Fi password without the ceremony of creating a .txt file.
Private Comms Channel: Need to coordinate your mission? Open a secure, one-on-one, real-time chat with any other hero on the network. Just click the icon and send your request.
Hero Reconnaissance: The user list is live and buzzing. And if you can't find your target, the search bar is your own personal Cerebro, filtering through every hero online instantly.
The Stark Tech Under the Hood
This isn't just a pretty face; it's powered by some seriously modern tech:
The Brain (Backend): A lightning-fast FastAPI server written in Python, handling all the heavy lifting.
The Nerves (Real-time): Persistent WebSocket connections keep everything in sync, from the user list to your private chats. There's no "refresh" button here.
The Face (Frontend): A slick, dynamic UI built with React and styled with the magic of Tailwind CSS & shadcn/ui. It's fast, it's responsive, and it just works.
The Memory (Database): A rock-solid PostgreSQL database managed with SQLAlchemy keeps track of file metadata just long enough for you to grab it.
The Global Infrastructure: The React UI is deployed on Netlify's edge network for insane speed, while the FastAPI brain and its PostgreSQL memory live happily together on Render.
So go ahead. Share something. It's what heroes do.


How It Works: Your Mission Briefing
Using FlowShare is dead simple. No sign-ups, no nonsense.
Suit Up: Just land on the site. You're instantly connected and given your Marvel codename for this session. Welcome to the team, hero.
Share Your Gear (Files):
Drag & Drop: The easiest way. Just drag one or more files from your desktop and drop 'em right into the "Share Files" box.
Old School Click: Click anywhere in that same box to open your file explorer and select as many files as you want (just keep the total under 100MB).
Send Intel (Notes):
Got a quick message, link, or code snippet? Type or paste it into the "Share a Note" box.
Choose Your Target(s):
In the "Available Marvel Heroes" list, just click on the names of the heroes you want to send your stuff to. They'll light up so you know they're selected.
Too many heroes online? Use the search bar at the top right to instantly find who you're looking for.
Confirm & Launch:
After you upload a file or create a note, a pop-up appears. It shows what you're sending and who you're sending it to.
Happy with your selection? Smash that "Share Now" button. Your package is instantly teleported.
Open a Private Comms Channel (Chat):
Want to chat one-on-one? Find the hero in the list and click the small message icon next to their name.
This sends them a private chat invitation. They'll get a notification with "Accept" or "Decline" options.
If they hit Accept, a private chat window pops up for both of you, and you can message each other in real-time. If they decline, no window appears.
Receiving a Package:
When someone sends you something, you'll get a pop-up notification.
If it's a file or a bundle of files, you'll see a download button for each one. If it's a note, you'll get a button to copy the text right to your clipboard.
And that's it. You're now a master of the FlowShare network. Go on, share something heroic.
