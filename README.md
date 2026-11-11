
## One-command publish + Android bug report

On Termux, after extracting this folder:

```bash
bash PUBLISH_AND_REPORT.sh
```

The script will create/push `juhjuhx/OpenDeSqueeze-Web`, enable GitHub Pages when permitted, create the `v0.1.0` web release, and file the known portrait 1.33× geometry bug against `juhjuhx/OpenDeSqueeze` using the locally authenticated GitHub CLI.
