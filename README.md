# Hybrid DNS lab: Azure DNS Private Resolver (Indonesia Central ⇄ Southeast Asia)

This step-by-step lab replaces DNS forwarder VMs with **Azure DNS Private Resolver** in a hybrid hub-spoke design:

- **"On-prem" (Indonesia Central):** a Windows Server 2022 VM running AD DS and DNS for `contoso.org` and `contoso.com`, plus a VPN gateway.
- **Azure (Southeast Asia):** a hub with a VPN gateway and DNS Private Resolver (inbound endpoint, outbound endpoint and forwarding ruleset). It is peered, with gateway transit, to a spoke that holds a VM and a blob Private Endpoint.
- **Site-to-site IPsec VPN** between the two sites, standing in for ExpressRoute.

Open `index.html` (published with GitHub Pages) for the guide, the screenshots and the results. Every step runs from Azure Cloud Shell (Bash):

```bash
git clone https://github.com/ibranibeny/contoso-dns-private-resolver-lab.git
cd contoso-dns-private-resolver-lab/scripts
chmod +x *.sh && git config core.fileMode false   # GitHub stores the scripts without the executable bit
./00-preflight.sh      # then run 01 ... 07 in order, or ./run-all.sh
./99-cleanup.sh        # delete everything when you are done (the gateways and resolver bill by the hour)
```

## Video walkthrough

`videos.html` has one short interactive video per stage (overview plus steps 0 to 13), and each step in `index.html` embeds its own video. They are built from the real lab run: camera moves over the architecture, animated DNS queries, the real Cloud Shell output and portal screenshots, plus clickable components, replay buttons and quick quizzes.

Narration plays with an AI-generated voice (Azure neural text-to-speech, recorded per line in `assets/audio/`). Captions match the narration. Mute it with the speaker icon or press `N`. If a clip can't load, the player reads that line with the browser's own voice instead.

This is a lab: it uses its own address ranges and is not connected to any customer network.
